/**
 * LocalLlamaProvider
 * Implementa AIProvider usando Ollama (LLaMA local) vía fetch nativo (Node.js 18+)
 */

import { AIProvider } from './AIProviderInterface';

export interface LocalLlamaProviderConfig {
  baseUrl?: string;
  model?: string;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
}

interface OllamaGenerateResponse {
  response: string;
  model: string;
  done: boolean;
  total_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    size: number;
    digest: string;
    modified_at: string;
  }>;
}

export class LocalLlamaProvider implements AIProvider {
  readonly name = 'llama';
  private baseUrl: string;
  private model: string;

  constructor(config: LocalLlamaProviderConfig = {}) {
    this.baseUrl =
      config.baseUrl ??
      process.env.OLLAMA_URL ??
      'http://localhost:11434';

    this.model =
      config.model ??
      process.env.OLLAMA_MODEL ??
      'llama3';

    // Strip trailing slash for clean URL concatenation
    this.baseUrl = this.baseUrl.replace(/\/$/, '');

    console.log(
      `[LocalLlamaProvider] Initialized — baseUrl: ${this.baseUrl}, model: ${this.model}`
    );
  }

  async call(prompt: string): Promise<string> {
    console.log(
      `[LocalLlamaProvider] Calling Ollama (model: ${this.model}, prompt length: ${prompt.length})`
    );

    const url = `${this.baseUrl}/api/generate`;
    const body: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama responded with ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as OllamaGenerateResponse;

      console.log(
        `[LocalLlamaProvider] Response received — ${data.response.length} chars`
      );
      return data.response;
    } catch (error) {
      console.error(`[LocalLlamaProvider] Error calling Ollama:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log(`[LocalLlamaProvider] Running health check...`);

    const url = `${this.baseUrl}/api/tags`;

    try {
      const response = await fetch(url, { method: 'GET' });

      if (response.status === 200) {
        const data = (await response.json()) as OllamaTagsResponse;
        const modelCount = data.models?.length ?? 0;
        console.log(
          `[LocalLlamaProvider] Health check OK — ${modelCount} model(s) available`
        );
        return true;
      }

      console.warn(
        `[LocalLlamaProvider] Health check returned status ${response.status}`
      );
      return false;
    } catch (error) {
      console.error(`[LocalLlamaProvider] Health check failed:`, error);
      return false;
    }
  }
}
