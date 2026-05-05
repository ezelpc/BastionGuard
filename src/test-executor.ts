import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";
import { DiagnosticEngine } from "./core/diagnostic-engine/DiagnosticEngine";

const receiver = new AlertReceiver(3000);
const diagnostic = new DiagnosticEngine();

receiver.onAlert(async (alert) => {
  console.log("\n🚨 Alerta recibida:", {
    service: alert.service,
    severity: alert.severity,
    message: alert.message,
  });

  const report = await diagnostic.diagnose(alert);

  console.log("\n📋 Reporte diagnóstico:");
  console.log("  Servicio:      ", report.service.name);
  console.log(
    "  Réplicas:      ",
    `${report.service.replicas.ready}/${report.service.replicas.desired}`
  );
  console.log("  Deploy reciente:", report.service.recentDeploy);
  console.log("  Causas:        ", report.possibleCauses);
  console.log("  Confianza:     ", `${(report.confidence * 100).toFixed(0)}%`);
  console.log("  Servicios relacionados:", report.relatedServices);
});

receiver.start();
