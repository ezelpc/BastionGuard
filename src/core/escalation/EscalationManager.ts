import { randomUUID } from "crypto";
import { AIDecision } from "../ai-agent/types";
import { DiagnosticReport } from "../diagnostic-engine/types";
import { EscalationEvent } from "./types";

export class EscalationManager {
  private history: EscalationEvent[] = [];
  private slackWebhookUrl?: string;

  public constructor() {
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
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
