import axios, { AxiosInstance } from 'axios';
import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

interface ServiceNowChannelConfig {
  instance?: string;
  username?: string;
  password?: string;
  assignmentGroup?: string;
}

/**
 * Creates ServiceNow incidents for BastionGuard escalation events.
 * Uses the ServiceNow Table API (REST) with Basic Auth.
 */
export class ServiceNowChannel implements EscalationChannel {
  public readonly name = 'servicenow';

  private readonly client: AxiosInstance;
  private readonly assignmentGroup?: string;

  public constructor(config: ServiceNowChannelConfig = {}) {
    const instance = config.instance ?? process.env.SNOW_INSTANCE;
    const username = config.username ?? process.env.SNOW_USER;
    const password = config.password ?? process.env.SNOW_PASSWORD;

    if (!instance) {
      throw new Error('[ServiceNowChannel] instance is required. Set SNOW_INSTANCE or pass instance in config.');
    }
    if (!username) {
      throw new Error('[ServiceNowChannel] username is required. Set SNOW_USER or pass username in config.');
    }
    if (!password) {
      throw new Error('[ServiceNowChannel] password is required. Set SNOW_PASSWORD or pass password in config.');
    }

    this.assignmentGroup = config.assignmentGroup;

    this.client = axios.create({
      baseURL: `https://${instance}`,
      auth: { username, password },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    console.log(`[ServiceNowChannel] Inicializado → https://${instance}`);
  }

  /**
   * Builds a full-text description of the incident for the ServiceNow record.
   */
  private buildDescription(message: EscalationMessage): string {
    const confidencePct = (message.confidence * 100).toFixed(0);
    const lines = [
      `=== Incidente BastionGuard ===`,
      ``,
      `Servicio:       ${message.service}`,
      `Severidad:      ${message.severity.toUpperCase()}`,
      `Motivo:         ${message.reason}`,
      `Confianza IA:   ${confidencePct}%`,
      `Tenant:         ${message.tenantId}`,
      `Timestamp:      ${message.timestamp}`,
    ];

    if (message.replicas !== undefined) {
      lines.push(`Réplicas:       ${message.replicas.ready}/${message.replicas.desired}`);
    }
    if (message.recentDeploy !== undefined) {
      lines.push(`Deploy Reciente: ${message.recentDeploy ? 'Sí' : 'No'}`);
    }

    if (message.possibleCauses.length > 0) {
      lines.push(``, `Causas Posibles:`);
      message.possibleCauses.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
    }

    lines.push(``, `--- Generado automáticamente por BastionGuard Auto-Remediation ---`);

    return lines.join('\n');
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();

    // urgency: 1=Critical, 2=High, 3=Medium, 4=Low
    const urgency = message.severity === 'critical' ? '1' : '2';

    const body: Record<string, string> = {
      short_description: `[BastionGuard] ${message.service}: ${message.reason}`,
      description: this.buildDescription(message),
      urgency,
      impact: '2',
      category: 'Software',
      subcategory: 'Application',
    };

    if (this.assignmentGroup) {
      body.assignment_group = this.assignmentGroup;
    }

    try {
      console.log(`[ServiceNowChannel] Creando incidente para servicio "${message.service}"...`);
      const response = await this.client.post<{ result: { number: string; sys_id: string } }>(
        '/api/now/table/incident',
        body
      );

      const incidentNumber = response.data.result?.number ?? 'N/A';
      const sysId = response.data.result?.sys_id ?? 'N/A';
      console.log(`[ServiceNowChannel] ✅ Incidente creado: ${incidentNumber}`);

      return {
        success: true,
        channel: this.name,
        timestamp,
        extra: { incidentNumber, sysId },
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = JSON.stringify(err.response?.data ?? {});
        console.error(`[ServiceNowChannel] ❌ Error HTTP ${status}: ${data}`);
        return {
          success: false,
          channel: this.name,
          error: `HTTP ${status}: ${data}`,
          timestamp,
        };
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ServiceNowChannel] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      console.log('[ServiceNowChannel] Ejecutando health check...');
      const response = await this.client.get('/api/now/table/incident', {
        params: { sysparm_limit: 1 },
      });
      const ok = response.status === 200;
      console.log(`[ServiceNowChannel] Health check: ${ok ? '✅ OK' : `❌ HTTP ${response.status}`}`);
      return ok;
    } catch (err) {
      console.error('[ServiceNowChannel] ❌ Health check falló:', err);
      return false;
    }
  }
}
