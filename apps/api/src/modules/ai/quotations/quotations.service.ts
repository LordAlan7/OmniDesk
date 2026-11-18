import { can, PERMISSIONS } from '../../../shared/authorization';
import { Errors } from '../../../shared/errors';
import type { AuthUser } from '../../../shared/types';
import { getTicketForUser } from '../../tickets';
import { createAIProvider } from '../providers';
import { aiQuotationSuggestionSchema } from './quotations.schemas';
import { quotationsRepository } from './quotations.repository';
import type {
  CreateQuotationInput,
  Quotation,
  UpdateQuotationInput,
} from './quotations.types';

export async function createQuotation(
  input: CreateQuotationInput,
  user: AuthUser,
  interaction?: {
    question: string;
    answer: string;
    providedContext: unknown[];
  },
): Promise<Quotation> {
  await getTicketForUser(input.ticketId, user);

  return quotationsRepository.create(
    input,
    user.id,
    interaction,
  );
}

export async function generateQuotationForTicket(
  ticketId: number,
  user: AuthUser,
): Promise<{
  quotation: Quotation;
  missingInformation: string[];
}> {
  if (!can(user, PERMISSIONS.AI_CONTEXT_TICKETS)) {
    throw Errors.forbidden();
  }

  const ticket = await getTicketForUser(ticketId, user);

  const context = {
    ticketId: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    categoryId: ticket.categoryId,
    storeLocation: ticket.storeLocation,
    motorcycleModel: ticket.motorcycleModel,
  };

  const provider = createAIProvider();

  if (!provider.suggestQuotation) {
    throw Errors.badGateway(
      'El proveedor de IA no soporta la generación de cotizaciones.',
    );
  }

  const rawSuggestion = await provider.suggestQuotation(context);
  const parsed = aiQuotationSuggestionSchema.safeParse(rawSuggestion);

  if (!parsed.success) {
    throw Errors.badGateway(
      'La propuesta de cotización generada por IA no cumple con el formato esperado.',
    );
  }

  const suggestion = parsed.data;
  const missingInformation = [
    ...new Set(suggestion.missingInformation),
  ];

  const observations = [
    suggestion.observations,
    'INTEGRACIÓN DE SERVICIOS',
    'Los precios, impuestos, descuentos y condiciones comerciales no fueron calculados. Deben completarse mediante las fuentes comerciales autorizadas.',
    missingInformation.length > 0
      ? `Información pendiente:\n${missingInformation
          .slice(0, 20)
          .map((item) => `- ${item}`)
          .join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 5000);

  const question = `Generar una propuesta preliminar de cotización para el ticket #${ticket.id}.`;

  const quotationInput: CreateQuotationInput = {
    ticketId: ticket.id,
    title: suggestion.title,
    description: suggestion.description,
    conditions: suggestion.conditions ?? undefined,
    observations,
    items: suggestion.items.map((item) => ({
      concept: item.concept,
      description: item.description ?? undefined,
      quantity: item.quantity,
      unit: item.unit ?? undefined,
    })),
  };

  const quotation = await createQuotation(
    quotationInput,
    user,
    {
      question,
      answer: JSON.stringify(suggestion),
      providedContext: [context],
    },
  );

  return {
    quotation,
    missingInformation,
  };
}

export async function getQuotation(
  quotationId: number,
  user: AuthUser,
): Promise<Quotation> {
  const quotation = await quotationsRepository.findById(quotationId);

  await getTicketForUser(quotation.ticketId, user);

  return quotation;
}

export async function listQuotations(
  ticketId: number,
  user: AuthUser,
): Promise<Quotation[]> {
  await getTicketForUser(ticketId, user);

  return quotationsRepository.listByTicket(ticketId);
}

export async function updateQuotation(
  quotationId: number,
  input: UpdateQuotationInput,
  user: AuthUser,
): Promise<Quotation> {
  const quotation = await quotationsRepository.findById(quotationId);

  await getTicketForUser(quotation.ticketId, user);

  if (quotation.createdBy !== user.id) {
    throw Errors.forbidden(
      'Solo el usuario que creó el borrador puede modificarlo.',
    );
  }

  return quotationsRepository.update(
    quotationId,
    user.id,
    input,
  );
}

export async function reviewQuotation(
  quotationId: number,
  input: {
    decision: 'approved' | 'rejected' | 'needs_more_info';
    reason: string;
    expectedVersion: number;
  },
  user: AuthUser,
) {
  if (!can(user, PERMISSIONS.AI_VALIDATE)) {
    throw Errors.forbidden();
  }

  if (
    input.decision === 'rejected' &&
    !user.roles.includes('Manager')
  ) {
    throw Errors.forbidden(
      'Solo un Manager puede rechazar una cotización.',
    );
  }

  const quotation = await quotationsRepository.findById(quotationId);

  await getTicketForUser(quotation.ticketId, user);

  if (input.decision === 'approved' && !quotation.currentVersion.isComplete) {
    throw Errors.invalidState(
      'No se puede aprobar una cotización incompleta.',
    );
  }

  return quotationsRepository.review(
    quotationId,
    user.id,
    input,
  );
}

export async function submitQuotationForReview(
  quotationId: number,
  user: AuthUser,
): Promise<Quotation> {
  const quotation = await quotationsRepository.findById(quotationId);

  await getTicketForUser(quotation.ticketId, user);

  if (quotation.createdBy !== user.id) {
    throw Errors.forbidden(
      'Solo el creador de la cotización puede enviarla a revisión.',
    );
  }

  return quotationsRepository.submitForReview(quotationId, user.id);
}