import { can, PERMISSIONS } from '../../shared/authorization';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { buildTicketContext, frameTicketContext } from './context/ticket-context';
import {
  buildInventoryContext,
  frameInventoryContext,
  summarizeInventory,
  type InventoryUsage,
} from './context/inventory-context';
import { createAIProvider } from './providers';
import type { AIProvider } from './providers/ai-provider';
import { retrieveAuthorizedContext } from './sources/retrieval';
import { frameAsData } from './sources/sources.policy';
import type { SourceReference } from './sources/sources.types';
import { validateCitedReferences } from './ai.citations';
import { screenSupportQuestion } from './ai.question-classifier';

export const INSUFFICIENT_INFORMATION =
  'No hay información autorizada suficiente para responder esta consulta.';

export type AuthorizedAnswer =
  | { status: 'insufficient_information'; message: string; references: []; aiGenerated: true }
  | { status: 'needs_more_info'; message: string; missingInformation: string[]; references: []; aiGenerated: true }
  | { status: 'out_of_scope'; message: string; references: []; aiGenerated: true }
  | { 
      status: 'answered'; 
      answer: string; 
      references: SourceReference[]; 
      aiGenerated: true;
      // AIR-007: Agregamos la trazabilidad
      providedContext: any[];
      citations: any[];
      generationConfig: Record<string, unknown>;
      // Paso 7: origen "inventario" usado como contexto (o no disponible).
      inventory?: InventoryUsage | undefined;
    };

export async function askWithAuthorizedSources(
  question: string,
  user: AuthUser,
  provider: AIProvider = createAIProvider(),
  options: { ticketId?: number } = {},
): Promise<AuthorizedAnswer> {
  if (!can(user, PERMISSIONS.AI_QUERY)) throw Errors.forbidden();
  const ticketContext =
    options.ticketId === undefined ? undefined : await buildTicketContext(options.ticketId, user);

  const screening = screenSupportQuestion(
    question,
    options.ticketId !== undefined,
  );

  if (screening.kind === 'needs_more_info') {
    return {
      status: 'needs_more_info',
      message: 'Necesito algunos datos adicionales para continuar con el diagnóstico.',
      missingInformation: screening.missingInformation,
      references: [],
      aiGenerated: true,
    };
  }

  if (screening.kind === 'out_of_scope') {
    return {
      status: 'out_of_scope',
      message: 'Esta consulta está fuera del alcance del asistente de soporte de OmniDesk.',
      references: [],
      aiGenerated: true,
    };
  }

  const retrieval = await retrieveAuthorizedContext(question, user);

  if (!retrieval.sufficient) {
    return { status: 'insufficient_information', message: INSUFFICIENT_INFORMATION, references: [], aiGenerated: true };
  }

  // Paso 7: se consulta inventario solo cuando ya se va a llamar al modelo
  // (no en respuestas tempranas) y nunca propaga errores de inventario.
  const inventoryContext =
    options.ticketId === undefined
      ? undefined
      : await buildInventoryContext(options.ticketId, user);

  // AIR-007: Armamos el contexto exacto que se le enviará al modelo.
  const contextToSend = [
    ...(ticketContext
      ? [{ articleId: 0, sourceType: 'ticket' as const, sourceId: ticketContext.ticketId, content: frameTicketContext(ticketContext) }]
      : []),
    ...(inventoryContext?.status === 'available'
      ? [{ articleId: 0, sourceType: 'inventory' as const, sourceId: options.ticketId ?? 0, content: frameInventoryContext(inventoryContext) }]
      : []),
    ...retrieval.fragments.map((fragment) => {
      const { content, ...reference } = fragment;
      return {
        articleId: fragment.sourceId,
        sourceType: fragment.sourceType,
        sourceId: fragment.sourceId,
        sourceVersion: fragment.sourceVersion,
        chunkIndex: fragment.chunkIndex,
        authorizationId: fragment.authorizationId,
        content: frameAsData(reference, content),
      };
    }),
  ];

  const answer = await provider.ask(question, contextToSend);

  // AIR-008: si durante la generación se retiró una fuente o el acceso al ticket, no se entrega el resultado.
  if (options.ticketId !== undefined) await buildTicketContext(options.ticketId, user);
  const stillValid = await retrieveAuthorizedContext(question, user);
  const validKeys = new Set(stillValid.fragments.map((f) => `${f.authorizationId}:${f.chunkIndex}`));
  if (!retrieval.fragments.every((f) => validKeys.has(`${f.authorizationId}:${f.chunkIndex}`))) {
    return { status: 'insufficient_information', message: INSUFFICIENT_INFORMATION, references: [], aiGenerated: true };
  }

  let references: SourceReference[];

  try {
    references = validateCitedReferences(
      answer.citations,
      retrieval.fragments
    );
  } catch {
    // Diagnóstico seguro: solo los identificadores que citó el modelo (sin texto de fuentes ni de la respuesta).
    console.error(
      '[ai] respuesta descartada: citas inválidas. Citadas:',
      JSON.stringify(answer.citations ?? null),
      '| Enviadas:',
      retrieval.fragments.map((f) => `${f.authorizationId}:${f.chunkIndex}`).join(','),
    );
    return {
      status: 'insufficient_information',
      message: INSUFFICIENT_INFORMATION,
      references: [],
      aiGenerated: true,
    };
  }

  if (references.length === 0) {
    console.error('[ai] respuesta descartada: el modelo no citó ninguna fuente (citas vacías).');
    return {
      status: 'insufficient_information',
      message: INSUFFICIENT_INFORMATION,
      references: [],
      aiGenerated: true,
    };
  }

  return {
    status: 'answered',
    answer: answer.text,
    references,
    aiGenerated: true,
    // AIR-007: Devolvemos la trazabilidad para que se guarde en la base de datos
    providedContext: contextToSend,
    inventory: inventoryContext ? summarizeInventory(inventoryContext) : undefined,
    citations: answer.citations || [],
    generationConfig: { 
      provider: 'default',
      generatedAt: new Date().toISOString() 
    },
  };
}