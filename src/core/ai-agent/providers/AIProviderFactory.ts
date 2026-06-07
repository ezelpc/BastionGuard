/**
 * AIProviderFactory
 * Crea instancias de AI providers basado en configuración.
 * Soporta creación individual, cascada de fallback y creación desde variables de entorno.
 */

import { AIProvider, AIProviderConfig, AIProviderType } from './AIProviderInterface';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { LocalLlamaProvider } from './LocalLlamaProvider';

export class AIProviderFactory {
  /**
   * Crea un provider individual según la configuración dada
   */
  static create(config: AIProviderConfig): AIProvider {
    console.log(`[AIProviderFactory] Creating provider: ${config.type}`);

    switch (config.type) {
      case 'claude':
        return new ClaudeProvider({
          apiKey: config.apiKey,
          model: config.model,
        });

      case 'openai':
        return new OpenAIProvider({
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        });

      case 'gemini':
        return new GeminiProvider({
          apiKey: config.apiKey,
          model: config.model,
        });

      case 'llama':
        return new LocalLlamaProvider({
          baseUrl: config.baseUrl,
          model: config.model,
        });

      default: {
        // Exhaustive check — TypeScript will warn if a new type is added without a case
        const exhaustive: never = config.type;
        throw new Error(`[AIProviderFactory] Unknown provider type: ${exhaustive}`);
      }
    }
  }

  /**
   * Crea una lista ordenada de providers para usar en cascada (fallback).
   * Se intenta el primero; si falla, se pasa al siguiente.
   *
   * @example
   * const providers = AIProviderFactory.createWithFallback([
   *   { type: 'claude' },
   *   { type: 'openai' },
   *   { type: 'llama' },
   * ]);
   */
  static createWithFallback(configs: AIProviderConfig[]): AIProvider[] {
    if (configs.length === 0) {
      throw new Error('[AIProviderFactory] At least one config must be provided for fallback chain');
    }

    const providers = configs.map((config) => AIProviderFactory.create(config));

    console.log(
      `[AIProviderFactory] Fallback chain created: ${providers.map((p) => p.name).join(' → ')}`
    );

    return providers;
  }

  /**
   * Crea un provider leyendo la configuración desde variables de entorno.
   *
   * Variables soportadas:
   *   AI_PROVIDER         → 'claude' | 'openai' | 'gemini' | 'llama'  (default: 'claude')
   *   ANTHROPIC_API_KEY   → para claude
   *   OPENAI_API_KEY      → para openai
   *   OPENAI_BASE_URL     → baseUrl opcional para openai
   *   GOOGLE_API_KEY      → para gemini
   *   OLLAMA_URL          → baseUrl para llama (default: http://localhost:11434)
   *   OLLAMA_MODEL        → modelo para llama (default: llama3)
   *   AI_MODEL            → modelo genérico (sobrescribe defaults por proveedor)
   */
  static createFromEnv(): AIProvider {
    const rawType = (process.env.AI_PROVIDER ?? 'claude').toLowerCase().trim();

    const validTypes: AIProviderType[] = ['claude', 'openai', 'gemini', 'llama'];
    if (!validTypes.includes(rawType as AIProviderType)) {
      console.warn(
        `[AIProviderFactory] Unknown AI_PROVIDER="${rawType}", defaulting to "claude"`
      );
    }

    const type: AIProviderType = validTypes.includes(rawType as AIProviderType)
      ? (rawType as AIProviderType)
      : 'claude';

    const model = process.env.AI_MODEL;

    console.log(`[AIProviderFactory] createFromEnv — type: ${type}, model: ${model ?? '(default)'}`);

    switch (type) {
      case 'claude':
        return new ClaudeProvider({
          apiKey: process.env.ANTHROPIC_API_KEY,
          model,
        });

      case 'openai':
        return new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY,
          model,
          baseUrl: process.env.OPENAI_BASE_URL,
        });

      case 'gemini':
        return new GeminiProvider({
          apiKey: process.env.GOOGLE_API_KEY,
          model,
        });

      case 'llama':
        return new LocalLlamaProvider({
          baseUrl: process.env.OLLAMA_URL,
          model: model ?? process.env.OLLAMA_MODEL,
        });
    }
  }
}
