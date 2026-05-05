import { IncomingAlert } from "../alert-receiver/types";
import { DiagnosticReport, ServiceStatus } from "./types";

export class DiagnosticEngine {
  // En pasos futuros esto consultará Kubernetes/ECS real
  // Por ahora simula el diagnóstico para poder construir el pipeline completo
  public async diagnose(alert: IncomingAlert): Promise<DiagnosticReport> {
    console.log(`\n[DIAGNOSTIC] Analizando alerta de: ${alert.service}`);

    const service = await this.getServiceStatus(alert.service);
    const relatedServices = await this.findRelatedServices(alert.service);
    const possibleCauses = this.analyzeCauses(alert, service);
    const confidence = this.calculateConfidence(alert, service, possibleCauses);

    const report: DiagnosticReport = {
      alert,
      generatedAt: new Date().toISOString(),
      service,
      relatedServices,
      possibleCauses,
      confidence,
    };

    console.log(`[DIAGNOSTIC] Reporte generado:`, {
      service: report.service.name,
      replicas: report.service.replicas,
      recentDeploy: report.service.recentDeploy,
      possibleCauses: report.possibleCauses,
      confidence: report.confidence,
    });

    return report;
  }

  private async getServiceStatus(serviceName: string): Promise<ServiceStatus> {
    // Aquí conectaremos el provider real en pasos siguientes
    // Simula diferentes estados según el nombre del servicio
    const scenarios: Record<string, ServiceStatus> = {
      "api-gateway": {
        name: "api-gateway",
        replicas: { desired: 3, ready: 2 },
        recentDeploy: true,
        deployedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        restartCount: 1,
      },
      "payments-svc": {
        name: "payments-svc",
        replicas: { desired: 2, ready: 2 },
        recentDeploy: false,
        restartCount: 0,
      },
    };

    return (
      scenarios[serviceName] ?? {
        name: serviceName,
        replicas: { desired: 1, ready: 1 },
        recentDeploy: false,
        restartCount: 0,
      }
    );
  }

  private async findRelatedServices(serviceName: string): Promise<string[]> {
    // Mapa de dependencias — en el futuro vendrá de config por tenant
    const dependencies: Record<string, string[]> = {
      "api-gateway": ["auth-service", "rate-limiter"],
      "payments-svc": ["api-gateway", "fraud-detection"],
      "auth-service": ["redis-cache"],
    };

    return dependencies[serviceName] ?? [];
  }

  private analyzeCauses(alert: IncomingAlert, service: ServiceStatus): string[] {
    const causes: string[] = [];

    if (service.recentDeploy) {
      causes.push("Deploy reciente detectado — posible regresión");
    }

    if (service.replicas.ready < service.replicas.desired) {
      causes.push(
        `Réplicas degradadas: ${service.replicas.ready}/${service.replicas.desired} listas`
      );
    }

    if (service.restartCount > 0) {
      causes.push(`Servicio reiniciado ${service.restartCount} vez/veces recientemente`);
    }

    if (alert.severity === "critical" && causes.length === 0) {
      causes.push("Causa desconocida — requiere investigación manual");
    }

    return causes;
  }

  private calculateConfidence(
    alert: IncomingAlert,
    service: ServiceStatus,
    causes: string[]
  ): number {
    let confidence = 0.5; // base

    if (service.recentDeploy) confidence += 0.3;
    if (service.replicas.ready < service.replicas.desired) confidence += 0.15;
    if (causes.length === 0) confidence -= 0.3;
    if (alert.severity === "critical") confidence -= 0.1;

    // Mantener entre 0 y 1
    return Math.min(1, Math.max(0, parseFloat(confidence.toFixed(2))));
  }
}
