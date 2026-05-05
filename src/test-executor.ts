import * as dotenv from "dotenv";
dotenv.config();

import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";
import { DiagnosticEngine } from "./core/diagnostic-engine/DiagnosticEngine";
import { AIDecisionAgent } from "./core/ai-agent/AIDecisionAgent";
import { ActionExecutor } from "./core/action-executor/ActionExecutor";
import { EscalationManager } from "./core/escalation/EscalationManager";

process.on("uncaughtException", (err) => {
  console.error("❌ Error no manejado:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promise rechazada:", reason);
});

const receiver = new AlertReceiver(3000);
const diagnostic = new DiagnosticEngine();
const agent = new AIDecisionAgent();
const executor = new ActionExecutor(true);
const escalation = new EscalationManager();

receiver.onAlert(async (alert) => {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚨 [${alert.severity.toUpperCase()}] ${alert.service}: ${alert.message}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const report = await diagnostic.diagnose(alert);
  console.log(`\n📋 Causas: ${report.possibleCauses.join(" | ")}`);
  console.log(`   Confianza: ${(report.confidence * 100).toFixed(0)}%`);

  const decision = await agent.decide({
    report,
    tenantId: "empresa-a",
    attemptNumber: 1,
  });

  console.log(`\n🤖 IA decide: ${decision.shouldAct ? decision.actionName : "no actuar"}`);
  console.log(`   Razonamiento: ${decision.reasoning}`);

  if (decision.escalate) {
    await escalation.escalate("empresa-a", report, decision);
    return;
  }

  if (decision.shouldAct && decision.actionName && decision.provider) {
    console.log(`\n⚙️  Ejecutando: ${decision.actionName}...`);

    const result = await executor.execute({
      actionName: decision.actionName,
      provider: decision.provider,
      tenantId: "empresa-a",
      params: decision.params ?? {},
      requestedBy: "ai-agent",
    });

    if (result.success) {
      console.log(`\n✅ Resuelto automáticamente`);
      console.log(`   ${result.details}`);
    } else {
      console.log(`\n❌ Acción fallida — escalando`);
      await escalation.escalate("empresa-a", report, {
        ...decision,
        escalate: true,
        escalationReason: result.error,
      });
    }
  }

  console.log(`\n📝 Audit: ${executor.getAuditLog().length} acción(es) registrada(s)`);
  console.log(`   Escalados: ${escalation.getHistory().length}`);
});

receiver.start();
