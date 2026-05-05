import * as dotenv from "dotenv";
dotenv.config();

import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";
import { DiagnosticEngine } from "./core/diagnostic-engine/DiagnosticEngine";
import { AIDecisionAgent } from "./core/ai-agent/AIDecisionAgent";

const receiver = new AlertReceiver(3000);
const diagnostic = new DiagnosticEngine();
const agent = new AIDecisionAgent();

receiver.onAlert(async (alert) => {
  console.log("\n🚨 Alerta recibida:", {
    service: alert.service,
    severity: alert.severity,
    message: alert.message,
  });

  // Paso 1: Diagnóstico
  const report = await diagnostic.diagnose(alert);
  console.log(
    `\n📋 Diagnóstico: ${report.possibleCauses.length} causa(s) — confianza ${(report.confidence * 100).toFixed(0)}%`
  );

  // Paso 2: Decisión IA
  const decision = await agent.decide({
    report,
    tenantId: "empresa-a",
    attemptNumber: 1,
  });

  console.log("\n🤖 Decisión de la IA:");
  console.log("  Actuar:      ", decision.shouldAct);
  console.log("  Acción:      ", decision.actionName ?? "ninguna");
  console.log("  Razonamiento:", decision.reasoning);
  console.log("  Confianza:   ", `${(decision.confidence * 100).toFixed(0)}%`);
  console.log("  Escalar:     ", decision.escalate);
  if (decision.escalationReason) {
    console.log("  Motivo:      ", decision.escalationReason);
  }
});

receiver.start();
