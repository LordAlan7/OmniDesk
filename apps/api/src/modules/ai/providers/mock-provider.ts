import { AIAnswer, AIProvider } from './ai-provider';

/** Proveedor de pruebas: no llama a ningún servicio externo. */
export class MockAIProvider implements AIProvider {
  async ask(question: string, context: { articleId: number; content: string }[]): Promise<AIAnswer> {
    if (context.length === 0) {
      return {
        text: 'No authorized information was found to answer this question.',
        sources: [],
        aiGenerated: true,
      };
    }
    return {
      text: `[MOCK] Suggested answer for: "${question}"`,
      sources: context.map((c) => c.articleId),
      aiGenerated: true,
    };
  }
}
