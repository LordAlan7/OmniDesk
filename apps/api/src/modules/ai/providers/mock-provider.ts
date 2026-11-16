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
    return {
      text: `[MOCK] Suggested answer for: "${question}"`,
      sources: context.filter((c) => c.sourceType !== 'ticket').map((c) => c.articleId),
      citations: context
        .filter((c) =>
          c.sourceType !== 'ticket' &&
          Number.isSafeInteger(c.authorizationId) &&
          (c.authorizationId ?? 0) > 0 &&
          Number.isSafeInteger(c.chunkIndex) &&
          (c.chunkIndex ?? -1) >= 0
        )
        .map((c) => ({
          authorizationId: c.authorizationId!,
          chunkIndex: c.chunkIndex!,
        })),
      aiGenerated: true,
    };
  }
}
