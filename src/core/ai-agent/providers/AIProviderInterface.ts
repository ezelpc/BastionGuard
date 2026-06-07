/**
 * AIProviderInterface
 * Contrato base para todos los providers de LLM en BastionGuard
 */

export interface AIProvider {
  readonly name: string;

  /**
   * Envía un prompt al LLM y retorna la respuesta como texto plano
   */
  call(prompt: string): Promise<string>;

  /**
   * Verifica que el provider esté disponible y operativo
   */
  healthCheck(): Promise<boolean>;
}

export type AIProviderType = 'claude' | 'openai' | 'gemini' | 'llama';

export interface AIProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string; // para ollama o proxies
}
