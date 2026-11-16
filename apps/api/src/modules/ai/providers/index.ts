import { env } from '../../../config/env';
import type { AIProvider } from './ai-provider';
import { MockAIProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';

/**
 * Único punto donde se decide el proveedor de IA según el entorno (AI_PROVIDER).
 * Los servicios piden el proveedor aquí; nunca instancian uno concreto ni leen credenciales.
 *
 * - 'mock':   no llama a ningún servicio; útil en desarrollo y pruebas.
 * - 'openai': llama a la API de OpenAI (AIR-001). Requiere OPENAI_API_KEY.
 *             Sin clave, la instanciación lanza (fail-fast) para que el despliegue
 *             no quede silenciosamente sin IA.
 */
export function createAIProvider(name: string = env.aiProvider): AIProvider {
  switch (name) {
    case 'mock':
      return new MockAIProvider();
    case 'openai':
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}". Register it in modules/ai/providers/index.ts.`);
  }
}