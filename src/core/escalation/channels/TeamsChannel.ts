import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

interface TeamsChannelConfig {
  webhookUrl?: string;
}

/**
 * Sends BastionGuard escalation alerts to Microsoft Teams via Incoming Webhook.
 * Uses Adaptive Cards v1.3 format for rich message formatting.
 */
export class TeamsChannel implements EscalationChannel {
  public readonly name = 'teams';

  private readonly webhookUrl: string;

  public constructor(config: TeamsChannelConfig = {}) {
    const url = config.webhookUrl ?? process.env.TEAMS_WEBHOOK_URL;
    if (!url) {
      throw new Error('[TeamsChannel] webhookUrl is required. Set TEAMS_WEBHOOK_URL or pass webhookUrl in config.');
    }
    this.webhookUrl = url;
    console.log('[TeamsChannel] Inicializado con webhook configurado.');
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();
    const confidencePct = (message.confidence * 100).toFixed(0);
    const severityLabel = message.severity.charAt(0).toUpperCase() + message.severity.slice(1);

    const facts: Array<{ title: string; value: string }> = [
      { title: 'Servicio', value: message.service },
      { title: 'Severidad', value: severityLabel },
      { title: 'Motivo', value: message.reason },
      { title: 'Confianza IA', value: `${confidencePct}%` },
      { title: 'Tenant', value: message.tenantId },
    ];

    if (message.replicas !== undefined) {
      facts.push({ title: 'Réplicas', value: `${message.replicas.ready}/${message.replicas.desired}` });
    }
    if (message.recentDeploy !== undefined) {
      facts.push({ title: 'Deploy Reciente', value: message.recentDeploy ? 'Sí ⚠️' : 'No' });
    }

    const body: unknown[] = [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: `🛡️ BastionGuard — Incidente ${severityLabel}`,
        wrap: true,
      },
      {
        type: 'FactSet',
        facts,
      },
    ];

    if (message.possibleCauses.length > 0) {
      body.push({
        type: 'TextBlock',
        text: `**Causas Posibles:**\n${message.possibleCauses.map((c) => `• ${c}`).join('\n')}`,
        wrap: true,
      });
    }

    body.push({
      type: 'TextBlock',
      text: `_${new Date(message.timestamp).toLocaleString('es-ES')} — BastionGuard v1.0_`,
      isSubtle: true,
      wrap: true,
    });

    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.3',
            body,
          },
        },
      ],
    };

    try {
      console.log(`[TeamsChannel] Enviando alerta para servicio "${message.service}"...`);
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[TeamsChannel] ✅ Alerta enviada correctamente.`);
        return { success: true, channel: this.name, timestamp };
      }

      const errorText = await response.text();
      console.error(`[TeamsChannel] ❌ Error HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        channel: this.name,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TeamsChannel] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      console.log('[TeamsChannel] Ejecutando health check...');
      const testPayload = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.3',
              body: [
                {
                  type: 'TextBlock',
                  text: '🛡️ BastionGuard health check ping',
                },
              ],
            },
          },
        ],
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      const ok = response.ok;
      console.log(`[TeamsChannel] Health check: ${ok ? '✅ OK' : `❌ HTTP ${response.status}`}`);
      return ok;
    } catch (err) {
      console.error('[TeamsChannel] ❌ Health check falló:', err);
      return false;
    }
  }
}
