/**
 * ClaudeProvider
 * Implementa AIProvider usando Anthropic Claude vía @anthropic-ai/sdk
 * La lógica central fue extraída de AIDecisionAgent.callClaude()
 */

import { AIProvider } from './AIProviderInterface';

export interface ClaudeProviderConfig {
  apiKey?: string;
  model?: string;
}

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private model: string;
  private apiKey: string | undefined;

  constructor(config: ClaudeProviderConfig = {}) {
    this.model = config.model ?? 'claude-sonnet-4-5';
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;

    console.log(`[ClaudeProvider] Initialized — model: ${this.model}`);
  }

  async call(prompt: string): Promise<string> {
    console.log(
      `[ClaudeProvider] Calling Claude (model: ${this.model}, prompt length: ${prompt.length})`
    );

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const response = await client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('');

      console.log(
        `[ClaudeProvider] Response received — ${text.length} chars`
      );
      return text;
    } catch (error) {
      console.error(`[ClaudeProvider] Error calling Claude:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log(`[ClaudeProvider] Running health check...`);

    try {
      await this.call('ping');
      console.log(`[ClaudeProvider] Health check OK`);
      return true;
    } catch (error) {
      console.error(`[ClaudeProvider] Health check failed:`, error);
      return false;
    }
  }
}
