import { randomUUID } from "crypto";
import { AIDecision } from "../ai-agent/types";
import { DiagnosticReport } from "../diagnostic-engine/types";
import { EscalationEvent } from "./types";
import { OnCallManager } from "./OnCallManager";
import { TwilioClient } from "./TwilioClient";
import {
  EscalationChannel,
  EscalationMessage,
  ChannelResult,
} from "./channels/EscalationChannel";
import { SlackChannel } from "./channels/SlackChannel";

/**
 * EscalationManager coordinates all escalation channels and on-call notifications.
 *
 * Supports multiple simultaneous channels (Slack, Teams, Jira, ServiceNow,
 * Discord, GenericWebhook) via the EscalationChannel interface.
 *
 * Usage:
 *   const manager = new EscalationManager();
 *   manager.addChannel(new TeamsChannel({ webhookUrl: '...' }));
 *   manager.addChannel(new JiraChannel({ jiraUrl: '...', email: '...', apiToken: '...' }));
 */
export class EscalationManager {
  private history: EscalationEvent[] = [];
  private channels: EscalationChannel[] = [];
  private onCallManager: OnCallManager;
  private twilioClient: TwilioClient;

  public constructor(channels?: EscalationChannel[]) {
    this.onCallManager = new OnCallManager();
    this.twilioClient = new TwilioClient();

    // Register explicitly provided channels first
    if (channels && channels.length > 0) {
      this.channels.push(...channels);
      console.log(
        `[EscalationManager] ${channels.length} canal(es) registrado(s) desde constructor.`
      );
    }

    // Auto-register SlackChannel if SLACK_WEBHOOK_URL is set and Slack wasn't
    // already included in the provided channels list
    const hasSlack = this.channels.some((c) => c.name === "slack");
    if (!hasSlack && process.env.SLACK_WEBHOOK_URL) {
      try {
        this.channels.push(new SlackChannel());
        console.log("[EscalationManager] Canal Slack registrado automáticamente (SLACK_WEBHOOK_URL detectado).");
      } catch (err) {
        console.warn("[EscalationManager] No se pudo registrar el canal Slack:", err);
      }
    }

    if (this.channels.length === 0) {
      console.log(
        "[EscalationManager] ⚠️  Sin canales configurados. Las alertas solo se mostrarán en consola."
      );
    }
  }

  /**
   * Dynamically registers an additional escalation channel.
   * Can be called after construction to extend channel list at runtime.
   */
  public addChannel(channel: EscalationChannel): void {
    this.channels.push(channel);
    console.log(`[EscalationManager] Canal "${channel.name}" agregado (total: ${this.channels.length}).`);
  }

  /**
   * Returns the list of currently registered channel names.
   */
  public getChannelNames(): string[] {
    return this.channels.map((c) => c.name);
  }

  public async escalate(
    tenantId: string,
    report: DiagnosticReport,
    decision: AIDecision
  ): Promise<EscalationEvent> {
    // Build the human-readable message (legacy, kept for EscalationEvent.message)
    const message = this.buildMessage(report, decision);

    // Build the structured EscalationMessage for channel delivery
    const escalationMessage = this.buildEscalationMessage(tenantId, report, decision);

    const event: EscalationEvent = {
      id: randomUUID(),
      tenantId,
      report,
      decision,
      channel: "slack",
      sentAt: new Date().toISOString(),
      message,
    };

    console.log(`\n📲 [ESCALATION] Enviando notificación...`);
    console.log(`   Tenant:   ${tenantId}`);
    console.log(`   Servicio: ${report.service.name}`);
    console.log(`   Motivo:   ${decision.escalationReason}`);
    console.log(`   Canales:  ${this.channels.length > 0 ? this.channels.map((c) => c.name).join(", ") : "ninguno (solo consola)"}`);

    // ── Dispatch to all registered channels ────────────────────────────────
    if (this.channels.length > 0) {
      const channelResults = await Promise.allSettled(
        this.channels.map((channel) => channel.send(escalationMessage))
      );

      channelResults.forEach((result, index) => {
        const channelName = this.channels[index]?.name ?? `canal-${index}`;
        if (result.status === "fulfilled") {
          const res: ChannelResult = result.value;
          if (res.success) {
            console.log(`   ✅ [${channelName}] Notificación enviada correctamente.`);
            if (res.extra) {
              console.log(`      Extra: ${JSON.stringify(res.extra)}`);
            }
          } else {
            console.error(`   ❌ [${channelName}] Error al enviar: ${res.error}`);
          }
        } else {
          console.error(
            `   ❌ [${channelName}] Excepción no capturada: ${result.reason}`
          );
        }
      });
    } else {
      // Fallback: print to console when no channels are configured
      console.log(`\n⚠️  Sin canales configurados — mostrando alerta en consola:`);
      console.log(`\n${message}`);
    }

    // ── Twilio On-Call (maintained intact) ────────────────────────────────
    const onCallEngineer = await this.onCallManager.getCurrentOnCall(tenantId);
    if (onCallEngineer) {
      console.log(`\n📞 [TWILIO] Contactando al guardia actual: ${onCallEngineer.engineerName}`);
      const voiceMessage = `Hola ${onCallEngineer.engineerName}, soy Bastion Guard. Se ha detectado una alerta crítica en el servicio ${report.service.name}. El motivo es ${decision.escalationReason}. Por favor, revisa el panel de control de inmediato.`;
      await this.twilioClient.makeCall(onCallEngineer.phoneNumber, voiceMessage);
    } else {
      console.log(`\n📞 [TWILIO] Ningún ingeniero de guardia activo encontrado para el tenant ${tenantId}.`);
    }

    this.history.push(event);
    return event;
  }

  /**
   * Constructs the structured EscalationMessage from a DiagnosticReport and AIDecision.
   * This is the canonical data model consumed by all EscalationChannel implementations.
   */
  private buildEscalationMessage(
    tenantId: string,
    report: DiagnosticReport,
    decision: AIDecision
  ): EscalationMessage {
    return {
      title: `BastionGuard — Escalado a On-Call: ${report.service.name}`,
      service: report.service.name,
      severity: report.alert.severity,
      reason: decision.escalationReason ?? report.alert.message,
      confidence: decision.confidence,
      possibleCauses: report.possibleCauses,
      replicas: {
        ready: report.service.replicas.ready,
        desired: report.service.replicas.desired,
      },
      recentDeploy: report.service.recentDeploy,
      timestamp: new Date().toISOString(),
      tenantId,
    };
  }

  /**
   * Builds the legacy plain-text message stored in EscalationEvent.message.
   * Kept for backwards compatibility with existing EscalationEvent consumers.
   */
  private buildMessage(report: DiagnosticReport, decision: AIDecision): string {
    const severity = report.alert.severity.toUpperCase();
    const emoji = severity === "CRITICAL" ? "🔴" : "🟡";

    return [
      `${emoji} *BastionGuard — Escalado a On-Call*`,
      ``,
      `*Servicio:* \`${report.service.name}\``,
      `*Severidad:* ${severity}`,
      `*Alerta:* ${report.alert.message}`,
      ``,
      `*Diagnóstico:*`,
      report.possibleCauses.map((c) => `  • ${c}`).join("\n"),
      ``,
      `*Motivo de escalado:* ${decision.escalationReason}`,
      `*Confianza IA:* ${(decision.confidence * 100).toFixed(0)}%`,
      ``,
      `*Réplicas:* ${report.service.replicas.ready}/${report.service.replicas.desired}`,
      `*Deploy reciente:* ${report.service.recentDeploy ? "Sí ⚠️" : "No"}`,
      ``,
      `_Escalado a las ${new Date().toLocaleTimeString("es-ES")} — BastionGuard v1.0_`,
    ].join("\n");
  }

  public getHistory(): EscalationEvent[] {
    return this.history;
  }
}
