import * as dotenv from "dotenv";
dotenv.config();

import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";
import { DiagnosticEngine } from "./core/diagnostic-engine/DiagnosticEngine";
import { AIDecisionAgent } from "./core/ai-agent/AIDecisionAgent";
import { ActionExecutor } from "./core/action-executor/ActionExecutor";
import { EscalationManager } from "./core/escalation/EscalationManager";
import { TenantConfigManager } from "./config/TenantConfigManager";
import { WebServer } from "./server/WebServer";

process.on("uncaughtException", (err) => {
  console.error("❌ Error no manejado:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promise rechazada:", reason);
});

const PORT = parseInt(process.env.API_PORT ?? "3000");
const webServer = new WebServer(PORT);
const receiver = new AlertReceiver(PORT, webServer.getExpressApp());
const diagnostic = new DiagnosticEngine();
const agent = new AIDecisionAgent();
const executor = new ActionExecutor(true);
const escalation = new EscalationManager();
const tenantConfig = new TenantConfigManager();

receiver.onAlert(async (alert) => {
  const TENANT_ID = "empresa-a";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚨 [${alert.severity.toUpperCase()}] ${alert.service}: ${alert.message}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Emitir alerta a la UI
  webServer.emitAlert(TENANT_ID, alert);

  const tenant = tenantConfig.getTenant(TENANT_ID);
  console.log(
    `\n🏢 Tenant: ${tenant.name} | Confianza mínima: ${tenant.aiThreshold.minConfidence * 100}%`
  );

  // Paso 1: Diagnóstico
  const report = await diagnostic.diagnose(alert);
  webServer.emitDiagnostic(TENANT_ID, report);
  console.log(`\n📋 Causas: ${report.possibleCauses.join(" | ")}`);
  console.log(`   Confianza: ${(report.confidence * 100).toFixed(0)}%`);

  // Paso 2: Decisión IA
  const decision = await agent.decide({
    report,
    tenantId: TENANT_ID,
    attemptNumber: 1,
  });
  webServer.emitDecision(TENANT_ID, decision);
  console.log(`\n🤖 IA decide: ${decision.shouldAct ? decision.actionName : "no actuar"}`);
  console.log(`   Razonamiento: ${decision.reasoning}`);

  // Paso 3: Verificar allowlist del tenant
  if (decision.shouldAct && decision.actionName) {
    const allowed = tenantConfig.isActionAllowed(TENANT_ID, decision.actionName);
    if (!allowed) {
      console.log(`\n🚫 Acción '${decision.actionName}' no permitida para tenant ${TENANT_ID}`);
      webServer.emitEscalation(
        TENANT_ID,
        `Acción '${decision.actionName}' no está en la allowlist del tenant`,
        report.service.name
      );
      await escalation.escalate(TENANT_ID, report, {
        ...decision,
        escalate: true,
        escalationReason: `Acción '${decision.actionName}' no está en la allowlist del tenant`,
      });
      return;
    }
  }

  // Paso 4: Escalar si la IA no puede resolver
  if (decision.escalate) {
    webServer.emitEscalation(
      TENANT_ID,
      decision.escalationReason ?? "Sin motivo",
      report.service.name
    );
    await escalation.escalate(TENANT_ID, report, decision);
    return;
  }

  // Paso 5: Ejecutar acción
  if (decision.shouldAct && decision.actionName && decision.provider) {
    console.log(`\n⚙️  Ejecutando: ${decision.actionName}...`);

    const result = await executor.execute({
      actionName: decision.actionName,
      provider: decision.provider,
      tenantId: TENANT_ID,
      params: decision.params ?? {},
      requestedBy: "ai-agent",
    });

    webServer.emitAction(TENANT_ID, result);

    if (result.success) {
      console.log(`\n✅ Resuelto automáticamente`);
      console.log(`   ${result.details}`);
    } else {
      console.log(`\n❌ Acción fallida — escalando`);
      webServer.emitEscalation(TENANT_ID, result.error ?? "Error desconocido", report.service.name);
      await escalation.escalate(TENANT_ID, report, {
        ...decision,
        escalate: true,
        escalationReason: result.error,
      });
    }
  }

  console.log(`\n📝 Audit: ${executor.getAuditLog().length} acción(es) registrada(s)`);
  console.log(`   Escalados: ${escalation.getHistory().length}`);
});

(async () => {
  try {
    await tenantConfig.load();
    await webServer.start();
    console.log("✅ BastionGuard iniciado correctamente\n");
  } catch (err) {
    console.error("❌ Error iniciando BastionGuard:", err);
    process.exit(1);
  }
})();

process.on("SIGTERM", () => {
  console.log("\n⏹️  Cerrando BastionGuard...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n⏹️  Cerrando BastionGuard...");
  process.exit(0);
});
