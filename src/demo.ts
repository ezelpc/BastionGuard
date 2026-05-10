import * as dotenv from "dotenv";
dotenv.config();

import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";
import { DiagnosticEngine } from "./core/diagnostic-engine/DiagnosticEngine";
import { AIDecisionAgent } from "./core/ai-agent/AIDecisionAgent";
import { ActionExecutor } from "./core/action-executor/ActionExecutor";
import { EscalationManager } from "./core/escalation/EscalationManager";
import { TenantConfigManager } from "./config/TenantConfigManager";
import { WebServer } from "./server/WebServer";
import { AuditLogger } from "./core/audit/AuditLogger";
import { AlertNormalizer } from "./core/alert-receiver/AlertNormalizer";

const PORT = parseInt(process.env.API_PORT ?? "3000");
const webServer = new WebServer(PORT);
const tenantConfig = new TenantConfigManager(
  process.env.TENANTS_CONFIG ?? "src/config/tenants.yml"
);
const receiver = new AlertReceiver(PORT, webServer.getExpressApp(), tenantConfig);
const diagnostic = new DiagnosticEngine();
const agent = new AIDecisionAgent();
const executor = new ActionExecutor(true);
const escalation = new EscalationManager();
const audit = AuditLogger.getInstance();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runDemo() {
  console.log("🚀 Iniciando pipeline de demo end-to-end...\n");

  const normalizer = new AlertNormalizer();

  const alerts = [
    normalizer.normalize("prometheus", {
      alerts: [
        {
          status: "firing",
          labels: { severity: "critical", job: "api-gateway" },
          annotations: { summary: "Latencia muy alta detectada en API Gateway" },
        },
      ],
    }),
    normalizer.normalize("grafana", {
      state: "alerting",
      ruleName: "auth-service",
      title: "Uso de memoria crítico (>90%)",
    }),
    normalizer.normalize("cloudwatch", {
      NewStateValue: "ALARM",
      AlarmName: "payments-db",
      NewStateReason: "Conexiones máximas alcanzadas",
    }),
  ];

  for (const [i, alert] of alerts.entries()) {
    console.log(`\n--- Simulando incidente ${i + 1}/3 ---`);

    // Inyectar alerta directamente al receiver
    receiver["alerts"].push(alert);
    const cb = receiver["onAlertCallback"];
    if (cb) {
      await cb(alert);
    }

    if (i < alerts.length - 1) {
      console.log(`\nEsperando 5 segundos antes de la siguiente alerta...`);
      await sleep(5000);
    }
  }

  console.log("\n🎉 Demo completada. Revisa el dashboard en http://localhost:3000");
}

receiver.onAlert(async (alert) => {
  // Asumiremos empresa-a para las demos de Prometheus/Grafana, empresa-b para Cloudwatch
  const TENANT_ID = alert.source === "cloudwatch" ? "empresa-b" : "empresa-a";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚨 [${alert.severity.toUpperCase()}] ${alert.service}: ${alert.message}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  webServer.emitAlert(TENANT_ID, alert);

  try {
    const tenant = tenantConfig.getTenant(TENANT_ID);
    console.log(
      `\n🏢 Tenant: ${tenant.name} | Confianza mínima: ${tenant.aiThreshold.minConfidence * 100}%`
    );

    const report = await diagnostic.diagnose(alert);
    webServer.emitDiagnostic(TENANT_ID, report);

    const decision = await agent.decide({
      report,
      tenantId: TENANT_ID,
      attemptNumber: 1,
    });
    webServer.emitDecision(TENANT_ID, decision);

    if (decision.shouldAct && decision.actionName) {
      const allowed = tenantConfig.isActionAllowed(TENANT_ID, decision.actionName);
      if (!allowed) {
        webServer.emitEscalation(
          TENANT_ID,
          `Acción '${decision.actionName}' no permitida por tenant`,
          report.service.name
        );
        await escalation.escalate(TENANT_ID, report, {
          ...decision,
          escalate: true,
          escalationReason: `Acción bloqueada`,
        });
        audit.append("blocked", {
          tenantId: TENANT_ID,
          service: report.service.name,
          label: decision.actionName,
          success: false,
          confidence: decision.confidence,
        });
        return;
      }
    }

    if (decision.escalate) {
      webServer.emitEscalation(
        TENANT_ID,
        decision.escalationReason ?? "Manual",
        report.service.name
      );
      await escalation.escalate(TENANT_ID, report, decision);
      audit.append("escalation", {
        tenantId: TENANT_ID,
        service: report.service.name,
        label: decision.escalationReason ?? "Escalado",
        success: false,
        confidence: decision.confidence,
      });
      return;
    }

    if (decision.shouldAct && decision.actionName && decision.provider) {
      const result = await executor.execute({
        actionName: decision.actionName,
        provider: decision.provider,
        tenantId: TENANT_ID,
        params: decision.params ?? {},
        requestedBy: "ai-agent",
      });

      webServer.emitAction(TENANT_ID, result);

      if (result.success) {
        audit.append("action", {
          tenantId: TENANT_ID,
          service: report.service.name,
          label: result.actionName,
          success: true,
          confidence: decision.confidence,
          details: result.details,
          dryRun: result.dryRun,
        });
      } else {
        webServer.emitEscalation(TENANT_ID, result.error ?? "Error", report.service.name);
        audit.append("action", {
          tenantId: TENANT_ID,
          service: report.service.name,
          label: result.actionName,
          success: false,
          details: result.error,
          dryRun: result.dryRun,
        });
        await escalation.escalate(TENANT_ID, report, {
          ...decision,
          escalate: true,
          escalationReason: result.error,
        });
      }
    }
  } catch (err) {
    const error = err as Error;
    console.error("Error en pipeline:", error.message);
  }
});

(async () => {
  try {
    await tenantConfig.load();
    webServer.registerTenants(tenantConfig.getAllTenants());
    await webServer.start();

    // Esperar un segundo para que el servidor levante y luego ejecutar demo
    setTimeout(runDemo, 1000);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
