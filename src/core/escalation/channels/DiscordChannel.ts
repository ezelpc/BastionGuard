import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

interface DiscordChannelConfig {
  webhookUrl?: string;
}

/** Discord embed color constants */
const DISCORD_COLOR_RED = 15158332;    // #E74C3C — Critical
const DISCORD_COLOR_ORANGE = 15105570; // #E67E22 — High
const DISCORD_COLOR_YELLOW = 16776960; // #FFFF00 — Medium / Low

/**
 * Sends BastionGuard escalation alerts to a Discord channel via Webhook.
 * Uses Discord Embeds for rich, structured message formatting.
 */
export class DiscordChannel implements EscalationChannel {
  public readonly name = 'discord';

  private readonly webhookUrl: string;

  public constructor(config: DiscordChannelConfig = {}) {
    const url = config.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
    if (!url) {
      throw new Error('[DiscordChannel] webhookUrl is required. Set DISCORD_WEBHOOK_URL or pass webhookUrl in config.');
    }
    this.webhookUrl = url;
    console.log('[DiscordChannel] Inicializado con webhook configurado.');
  }

  private getEmbedColor(severity: EscalationMessage['severity']): number {
    if (severity === 'critical') return DISCORD_COLOR_RED;
    if (severity === 'high') return DISCORD_COLOR_ORANGE;
    return DISCORD_COLOR_YELLOW;
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();
    const confidencePct = (message.confidence * 100).toFixed(0);
    const color = this.getEmbedColor(message.severity);

    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      { name: 'Severidad', value: message.severity.toUpperCase(), inline: true },
      { name: 'Confianza IA', value: `${confidencePct}%`, inline: true },
      { name: 'Tenant', value: `\`${message.tenantId}\``, inline: true },
      { name: 'Motivo', value: message.reason, inline: false },
    ];

    if (message.possibleCauses.length > 0) {
      fields.push({
        name: 'Causas Posibles',
        value: message.possibleCauses.map((c) => `• ${c}`).join('\n'),
        inline: false,
      });
    }

    if (message.replicas !== undefined) {
      fields.push({
        name: 'Réplicas',
        value: `${message.replicas.ready}/${message.replicas.desired}`,
        inline: true,
      });
    }

    if (message.recentDeploy !== undefined) {
      fields.push({
        name: 'Deploy Reciente',
        value: message.recentDeploy ? 'Sí ⚠️' : 'No',
        inline: true,
      });
    }

    const payload = {
      username: 'BastionGuard',
      avatar_url: 'https://cdn.prod.website-files.com/6479ff59e5fbe9a3a6a44949/647ad44f2e9e3db2dc8cfe08_bastionguard.png',
      embeds: [
        {
          title: `🔴 Incidente Detectado: ${message.service}`,
          description: message.title,
          color,
          fields,
          footer: {
            text: 'BastionGuard Auto-Remediation',
          },
          timestamp: message.timestamp,
        },
      ],
    };

    try {
      console.log(`[DiscordChannel] Enviando alerta para servicio "${message.service}"...`);
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Discord webhooks return 204 No Content on success
      if (response.ok) {
        console.log(`[DiscordChannel] ✅ Alerta enviada correctamente.`);
        return { success: true, channel: this.name, timestamp };
      }

      const errorText = await response.text();
      console.error(`[DiscordChannel] ❌ Error HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        channel: this.name,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[DiscordChannel] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      console.log('[DiscordChannel] Ejecutando health check...');
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'ping' }),
      });

      const ok = response.ok;
      console.log(`[DiscordChannel] Health check: ${ok ? '✅ OK' : `❌ HTTP ${response.status}`}`);
      return ok;
    } catch (err) {
      console.error('[DiscordChannel] ❌ Health check falló:', err);
      return false;
    }
  }
}
