import type { AuthorizedAnswer } from './ai.service';

export type AITransparencyStatus =
  | 'supported'
  | 'needs_more_info'
  | 'insufficient_support'
  | 'out_of_scope'
  | 'technical_error';

export interface AITransparency {
  status: AITransparencyStatus;
  title: string;
  message: string;
  requiresHumanReview: boolean;
  missingInformation: string[];
}

export type TransparencyDecision =
  | { kind: 'supported'; verifiedReferenceCount: number }
  | { kind: 'needs_more_info'; missingInformation: string[] }
  | { kind: 'insufficient_support' }
  | { kind: 'out_of_scope' }
  | { kind: 'technical_error' };

export function buildAITransparency(
  decision: TransparencyDecision,
): AITransparency {
  switch (decision.kind) {
    case 'supported':
      if (decision.verifiedReferenceCount < 1) {
        throw new Error('AI_REFERENCES_REQUIRED');
      }

      return {
        status: 'supported',
        title: 'Recomendación generada por IA',
        message:
          'Esta recomendación utiliza referencias verificadas, pero no garantiza la solución del problema. Requiere revisión humana antes de aplicarse.',
        requiresHumanReview: true,
        missingInformation: [],
      };

    case 'needs_more_info': {
      const missingInformation = decision.missingInformation
        .map((item) => item.trim())
        .filter(Boolean);

      if (missingInformation.length === 0) {
        throw new Error('AI_MISSING_INFORMATION_REQUIRED');
      }

      return {
        status: 'needs_more_info',
        title: 'Información adicional necesaria',
        message:
          'Se necesitan los siguientes datos para continuar con la consulta.',
        requiresHumanReview: false,
        missingInformation,
      };
    }

    case 'insufficient_support':
      return {
        status: 'insufficient_support',
        title: 'Respaldo insuficiente',
        message:
          'El conocimiento autorizado disponible no permite respaldar una recomendación. Puedes solicitar asistencia humana.',
        requiresHumanReview: false,
        missingInformation: [],
      };

    case 'out_of_scope':
      return {
        status: 'out_of_scope',
        title: 'Consulta fuera de alcance',
        message:
          'Esta consulta está fuera del alcance del asistente. Contacta al personal de soporte.',
        requiresHumanReview: false,
        missingInformation: [],
      };

    case 'technical_error':
      return {
        status: 'technical_error',
        title: 'Servicio no disponible',
        message:
          'Ocurrió un problema técnico al procesar la consulta. No se obtuvo un diagnóstico.',
        requiresHumanReview: false,
        missingInformation: [],
      };
  }
}

export function transparencyForAuthorizedAnswer(
  answer: AuthorizedAnswer,
): AITransparency {
  if (answer.status === 'answered') {
    return buildAITransparency({
      kind: 'supported',
      verifiedReferenceCount: answer.references.length,
    });
  }

  if (answer.status === 'needs_more_info') {
    return buildAITransparency({
      kind: 'needs_more_info',
      missingInformation: answer.missingInformation,
    });
  }

  if (answer.status === 'out_of_scope') {
    return buildAITransparency({
      kind: 'out_of_scope',
    });
  }

  return buildAITransparency({
    kind: 'insufficient_support',
  });
}