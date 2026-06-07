import axios, { AxiosInstance, Method } from 'axios';
import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

type AuthType = 'bearer' | 'basic' | 'apikey' | 'none';

interface GenericWebhookChannelConfig {
  url?: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authType?: AuthType;
  /** Token for bearer, 'user:pass' for basic, or key value for apikey */
  authValue?: string;
  /** Header name to use when authType is 'apikey', defaults to 'X-API-Key' */
  apiKeyHeader?: string;
  /**
   * Optional JSON string template with placeholders like {service}, {severity},
   * {reason}, {confidence}, {tenantId}, {timestamp}, {title}.
   * If not provided, the full EscalationMessage is sent as JSON.
   */
  payloadTemplate?: string;
}

/**
 * A flexible escalation channel that can integrate with any HTTP webhook endpoint.
 * Supports Bearer, Basic, API-Key, and no-auth modes.
 * Optionally uses a JSON string template with {placeholder} substitution.
 */
export class GenericWebhookChannel implements EscalationChannel {
  public readonly name: string;

  private readonly client: AxiosInstance;
  private readonly url: string;
  private readonly method: Method;
  private readonly payloadTemplate?: string;
  private readonly authType: AuthType;
  private readonly authValue?: string;
  private readonly apiKeyHeader: string;
  private readonly extraHeaders: Record<string, string>;

  public constructor(config: GenericWebhookChannelConfig = {}, channelName = 'generic-webhook') {
    const url = config.url ?? process.env.GENERIC_WEBHOOK_URL;
    if (!url) {
      throw new Error(
        '[GenericWebhookChannel] url is required. Set GENERIC_WEBHOOK_URL or pass url in config.'
      );
    }

    this.name = channelName;
    this.url = url;
    this.method = (config.method ?? 'POST') as Method;
    this.authType = config.authType ?? 'none';
    this.authValue = config.authValue;
    this.apiKeyHeader = config.apiKeyHeader ?? 'X-API-Key';
    this.extraHeaders = config.headers ?? {};
    this.payloadTemplate = config.payloadTemplate;

    this.client = axios.create({
      timeout: 15000,
    });

    console.log(`[GenericWebhookChannel:${this.name}] Inicializado → ${this.method} ${url}`);
  }

  /**
   * Builds the final HTTP headers, including auth.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };

    switch (this.authType) {
      case 'bearer':
        if (this.authValue) {
          headers['Authorization'] = `Bearer ${this.authValue}`;
        }
        break;

      case 'basic':
        if (this.authValue) {
          const encoded = Buffer.from(this.authValue).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;

      case 'apikey':
        if (this.authValue) {
          headers[this.apiKeyHeader] = this.authValue;
        }
        break;

      case 'none':
      default:
        break;
    }

    return headers;
  }

  /**
   * Replaces {placeholder} tokens in the template with values from the message.
   */
  private interpolateTemplate(template: string, message: EscalationMessage): unknown {
    const confidencePct = (message.confidence * 100).toFixed(0);
    const interpolated = template
      .replace(/\{service\}/g, message.service)
      .replace(/\{severity\}/g, message.severity)
      .replace(/\{reason\}/g, message.reason)
      .replace(/\{confidence\}/g, confidencePct)
      .replace(/\{tenantId\}/g, message.tenantId)
      .replace(/\{timestamp\}/g, message.timestamp)
      .replace(/\{title\}/g, message.title)
      .replace(/\{possibleCauses\}/g, message.possibleCauses.join(', '));

    try {
      return JSON.parse(interpolated);
    } catch {
      // If the interpolated result is not valid JSON, return as plain string
      return interpolated;
    }
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();
    const headers = this.buildHeaders();
    const payload = this.payloadTemplate
      ? this.interpolateTemplate(this.payloadTemplate, message)
      : message;

    try {
      console.log(
        `[GenericWebhookChannel:${this.name}] Enviando alerta para servicio "${message.service}"...`
      );

      const response = await this.client.request({
        method: this.method,
        url: this.url,
        headers,
        data: payload,
      });

      console.log(
        `[GenericWebhookChannel:${this.name}] ✅ Respuesta HTTP ${response.status}.`
      );
      return {
        success: true,
        channel: this.name,
        timestamp,
        extra: { httpStatus: response.status },
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = JSON.stringify(err.response?.data ?? {});
        console.error(`[GenericWebhookChannel:${this.name}] ❌ Error HTTP ${status}: ${data}`);
        return {
          success: false,
          channel: this.name,
          error: `HTTP ${status}: ${data}`,
          timestamp,
        };
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GenericWebhookChannel:${this.name}] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    const headers = this.buildHeaders();

    try {
      console.log(`[GenericWebhookChannel:${this.name}] Ejecutando health check...`);
      const response = await this.client.request({
        method: this.method,
        url: this.url,
        headers,
        data: {},
        // Allow any response — even 4xx means the server is reachable
        validateStatus: () => true,
      });

      // Any response (including 4xx) means the server is reachable
      // Only network errors (ECONNREFUSED, etc.) return false
      const reachable = response.status < 500;
      console.log(
        `[GenericWebhookChannel:${this.name}] Health check: ${reachable ? '✅ Reachable' : `❌ HTTP ${response.status}`}`
      );
      return reachable;
    } catch (err) {
      // Network error — server is not reachable
      console.error(`[GenericWebhookChannel:${this.name}] ❌ Health check falló:`, err);
      return false;
    }
  }
}
