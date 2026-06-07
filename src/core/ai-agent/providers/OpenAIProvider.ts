/**
 * OpenAIProvider
 * Implementa AIProvider usando OpenAI SDK
 * Soporta baseUrl para proxies o instancias compatibles con OpenAI (Azure, LM Studio, etc.)
 */

import OpenAI from 'openai';
import { AIProvider } from './AIProviderInterface';

export interface OpenAIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private model: string;
  private client: OpenAI;

  constructor(config: OpenAIProviderConfig = {}) {
    this.model = config.model ?? 'gpt-4o';

    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
    };

    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }

    this.client = new OpenAI(clientOptions);

    console.log(
      `[OpenAIProvider] Initialized — model: ${this.model}, baseUrl: ${config.baseUrl ?? '(default)'}`
    );
  }

  async call(prompt: string): Promise<string> {
    console.log(
      `[OpenAIProvider] Calling OpenAI (model: ${this.model}, prompt length: ${prompt.length})`
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      });

      const content = completion.choices[0]?.message?.content ?? '';

      console.log(
        `[OpenAIProvider] Response received — ${content.length} chars`
      );
      return content;
    } catch (error) {
      console.error(`[OpenAIProvider] Error calling OpenAI:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log(`[OpenAIProvider] Running health check...`);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });

      const ok = !!completion.choices[0]?.message?.content;
      console.log(`[OpenAIProvider] Health check ${ok ? 'OK' : 'FAILED'}`);
      return ok;
    } catch (error) {
      console.error(`[OpenAIProvider] Health check failed:`, error);
      return false;
    }
  }
}
