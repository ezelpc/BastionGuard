/**
 * GeminiProvider
 * Implementa AIProvider usando Google Generative AI SDK
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './AIProviderInterface';

export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private model: string;
  private genAI: GoogleGenerativeAI;

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY ?? '';
    this.model = config.model ?? 'gemini-1.5-pro';
    this.genAI = new GoogleGenerativeAI(apiKey);

    console.log(`[GeminiProvider] Initialized — model: ${this.model}`);
  }

  async call(prompt: string): Promise<string> {
    console.log(
      `[GeminiProvider] Calling Gemini (model: ${this.model}, prompt length: ${prompt.length})`
    );

    try {
      const generativeModel = this.genAI.getGenerativeModel({
        model: this.model,
      });

      const result = await generativeModel.generateContent(prompt);
      const text = result.response.text();

      console.log(
        `[GeminiProvider] Response received — ${text.length} chars`
      );
      return text;
    } catch (error) {
      console.error(`[GeminiProvider] Error calling Gemini:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log(`[GeminiProvider] Running health check...`);

    try {
      await this.call('ping');
      console.log(`[GeminiProvider] Health check OK`);
      return true;
    } catch (error) {
      console.error(`[GeminiProvider] Health check failed:`, error);
      return false;
    }
  }
}
