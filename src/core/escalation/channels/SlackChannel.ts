import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

interface SlackChannelConfig {
  webhookUrl?: string;
}

/**
 * Sends BastionGuard escalation alerts to a Slack channel via Incoming Webhook.
 * Uses Slack Block Kit for rich message formatting.
 */
export class SlackChannel implements EscalationChannel {
  public readonly name = 'slack';

  private readonly webhookUrl: string;

  public constructor(config: SlackChannelConfig = {}) {
    const url = config.webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
    if (!url) {
      throw new Error('[SlackChannel] webhookUrl is required. Set SLACK_WEBHOOK_URL or pass webhookUrl in config.');
    }
    this.webhookUrl = url;
    console.log('[SlackChannel] Inicializado con webhook configurado.');
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();
    const severityEmoji = message.severity === 'critical' ? '🔴' : message.severity === 'high' ? '🟠' : '🟡';
    const confidencePct = (message.confidence * 100).toFixed(0);

    const payload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} BastionGuard Alert — ${message.severity.toUpperCase()}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Servicio:*\n\`${message.service}\`` },
            { type: 'mrkdwn', text: `*Severidad:*\n${message.severity.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Motivo:*\n${message.reason}` },
            { type: 'mrkdwn', text: `*Confianza IA:*\n${confidencePct}%` },
          ],
        },
        ...(message.possibleCauses.length > 0
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Causas Posibles:*\n${message.possibleCauses.map((c) => `• ${c}`).join('\n')}`,
                },
              },
            ]
          : []),
        ...(message.replicas !== undefined
          ? [
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Réplicas:*\n${message.replicas.ready}/${message.replicas.desired}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Deploy Reciente:*\n${message.recentDeploy ? 'Sí ⚠️' : 'No'}`,
                  },
                ],
              },
            ]
          : []),
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Tenant: \`${message.tenantId}\` | ${new Date(message.timestamp).toLocaleString('es-ES')} | BastionGuard v1.0`,
            },
          ],
        },
        { type: 'divider' },
      ],
    };

    try {
      console.log(`[SlackChannel] Enviando alerta para servicio "${message.service}"...`);
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[SlackChannel] ✅ Alerta enviada correctamente.`);
        return { success: true, channel: this.name, timestamp };
      }

      const errorText = await response.text();
      console.error(`[SlackChannel] ❌ Error HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        channel: this.name,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SlackChannel] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      console.log('[SlackChannel] Ejecutando health check...');
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'BastionGuard health check ping' }),
      });
      const ok = response.ok;
      console.log(`[SlackChannel] Health check: ${ok ? '✅ OK' : `❌ HTTP ${response.status}`}`);
      return ok;
    } catch (err) {
      console.error('[SlackChannel] ❌ Health check falló:', err);
      return false;
    }
  }
}
