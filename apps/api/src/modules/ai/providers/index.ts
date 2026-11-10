import { env } from '../../../config/env';
import type { AIProvider } from './ai-provider';
import { MockAIProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';

/**
 * Único punto donde se decide el proveedor de IA según el entorno (AI_PROVIDER).
 * Los servicios piden el proveedor aquí; nunca instancian uno concreto ni leen credenciales.
 */
export function createAIProvider(name: string = env.aiProvider): AIProvider {
  switch (name) {
    case 'mock':
      return new MockAIProvider();
    case 'openai':
      if (!env.openAiApiKey || !env.aiModel) {
        throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY and AI_MODEL.');
      }
      return new OpenAIProvider({
        apiKey: env.openAiApiKey,
        model: env.aiModel,
        timeoutMs: env.aiTimeoutMs,
        maxOutputTokens: env.aiMaxOutputTokens,
      });
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}". Register it in modules/ai/providers/index.ts.`);
  }
}
