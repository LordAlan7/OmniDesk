export type QuestionScreening =
  | { kind: 'continue' }
  | { kind: 'needs_more_info'; missingInformation: string[] }
  | { kind: 'out_of_scope' };

function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const vagueQuestions = new Set([
  'no funciona',
  'no sirve',
  'tengo un problema',
  'necesito ayuda',
  'que hago',
  'se descompuso',
]);

const outsideScopePatterns = [
  /^(?:que|cual) (?:clima|pronostico del tiempo)(?: hay| hace| hara| sera)?(?: .*)?$/,
  /^(?:dame|quiero) una receta(?: .*)?$/,
  /^(?:cuentame|dime) un chiste(?: .*)?$/,
];

/**
 * NFR-003: clasificación conservadora mediante reglas del servidor.
 * Los casos no reconocidos continúan hacia la recuperación autorizada.
 */
export function screenSupportQuestion(
  question: string,
  hasTicketContext: boolean,
): QuestionScreening {
  const normalized = normalizeQuestion(question);

  if (outsideScopePatterns.some((pattern) => pattern.test(normalized))) {
    return { kind: 'out_of_scope' };
  }

  if (!hasTicketContext && vagueQuestions.has(normalized)) {
    return {
      kind: 'needs_more_info',
      missingInformation: [
        'Equipo o sistema afectado',
        'Síntoma o mensaje de error',
        'Acciones que ya se intentaron',
      ],
    };
  }

  return { kind: 'continue' };
}
