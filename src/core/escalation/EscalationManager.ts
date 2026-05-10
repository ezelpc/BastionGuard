import { randomUUID } from "crypto";
import { AIDecision } from "../ai-agent/types";
import { DiagnosticReport } from "../diagnostic-engine/types";
import { EscalationEvent } from "./types";
import { OnCallManager } from "./OnCallManager";
import { TwilioClient } from "./TwilioClient";

export class EscalationManager {
  private history: EscalationEvent[] = [];
  private slackWebhookUrl?: string;
  private onCallManager: OnCallManager;
  private twilioClient: TwilioClient;

  public constructor() {
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.onCallManager = new OnCallManager();
    this.twilioClient = new TwilioClient();
  }

  public async escalate(
    tenantId: string,
    report: DiagnosticReport,
    decision: AIDecision
  ): Promise<EscalationEvent> {
    const message = this.buildMessage(report, decision);

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
    console.log(`   Tenant:  ${tenantId}`);
    console.log(`   Servicio: ${report.service.name}`);
    console.log(`   Motivo:  ${decision.escalationReason}`);

    if (this.slackWebhookUrl) {
      await this.sendToSlack(message);
    } else {
      console.log(`\n⚠️  SLACK_WEBHOOK_URL no configurado — simulando envío:`);
      console.log(`\n${message}`);
    }

    // Call the On-Call Engineer via Twilio
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

  private async sendToSlack(message: string): Promise<void> {
    try {
      const response = await fetch(this.slackWebhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      if (response.ok) {
        console.log(`   ✅ Notificación enviada a Slack`);
      } else {
        console.error(`   ❌ Error enviando a Slack: ${response.status}`);
      }
    } catch (err) {
      console.error(`   ❌ Error de conexión con Slack:`, err);
    }
  }

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
