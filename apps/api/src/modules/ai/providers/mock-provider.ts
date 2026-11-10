import { AIAnswer, AIContextItem, AIProvider } from './ai-provider';

/** Proveedor de pruebas: no llama a ningún servicio externo. */
export class MockAIProvider implements AIProvider {
  async ask(question: string, context: AIContextItem[]): Promise<AIAnswer> {
    if (context.length === 0) {
      return {
        text: 'No authorized information was found to answer this question.',
        sources: [],
        aiGenerated: true,
      };
    }
    const text = `[MOCK] Suggested answer for: "${question}"`;
    return {
      text,
      recommendation: text,
      steps: [],
      // Solo cita los fragmentos de fuentes (los tickets no son fuentes).
      citations: context.flatMap((c) => (c.authorizationId === undefined ? [] : [c.authorizationId])),
      sources: context.filter((c) => c.sourceType !== 'ticket').map((c) => c.articleId),
      aiGenerated: true,
    };
  }
}
