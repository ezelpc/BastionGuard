import { IncomingAlert } from "../alert-receiver/types";
import {
    LogProvider,
    MetricsProvider,
    MetricTimeseries,
    StateProvider,
} from "./data-sources/types";
import { AnomalyDetection, RCAContext, RCAEngine } from "./rca-engine/RCAEngine";
import { DiagnosticReport, ServiceStatus } from "./types";

/**
 * DiagnosticEngine - Análisis profundo en tiempo real
 * NUEVO: Consulta datos REALES (no mock)
 */
export class DiagnosticEngine {
  constructor(
    private metricsProvider: MetricsProvider,
    private logProvider: LogProvider,
    private stateProvider: StateProvider,
    private namespace: string = "default"
  ) {}

  public async diagnose(alert: IncomingAlert): Promise<DiagnosticReport> {
    console.log(`\n[DIAGNOSTIC] 🔍 Analizando alerta de: ${alert.service}`);
    const startTime = Date.now();

    // Si estamos en modo de simulación de IA, retornar reporte detallado realista
    if (process.env.AI_MOCK === "true") {
      console.log(`[DIAGNOSTIC] Modo mock activo — Generando reporte simulado de alta fidelidad`);
      await new Promise((resolve) => setTimeout(resolve, 800)); // simular latencia
      return this.createMockReport(alert);
    }

    try {
      // 1. Estado actual del servicio
      const serviceStatus = await this.getServiceStatus(alert.service);

      // 2. Métricas históricas (últimas 2 horas)
      const metrics = await this.getHistoricalMetrics(alert.service);

      // 3. Logs relevantes (últimas 30 min)
      const logs = await this.getRelatedLogs(alert.service, alert);

      // 4. Cambios recientes
      const recentDeployments = await this.getRecentDeployments(alert.service);

      // 5. Dependencias afectadas
      const relatedServices = await this.findRelatedServices(alert.service);

      // 6. Error rate
      const errorRate = await this.logProvider.getErrorRate(
        alert.service,
        {
          start: new Date(Date.now() - 2 * 60 * 60 * 1000),
          end: new Date(),
        }
      );

      // 7. Detectar anomalías
      const anomalies = this.detectAnomalies(metrics);

      // 8. Análisis de causa raíz (RCA)
      // ServiceStatus (public) is a subset of ServiceStatusSnapshot (RCA internal);
      // provide the required extra fields with safe defaults.
      const rcaContext: RCAContext = {
        alert,
        serviceStatus: {
          ...serviceStatus,
          status: 'Running' as const,
          lastUpdate: new Date(),
        },
        metrics: this.organizeMetrics(metrics),
        logs,
        recentDeployments,
        errorRate,
        anomalies,
      };

      const rca = RCAEngine.analyze(rcaContext);

      // 9. Calcular confianza final
      const confidence = this.calculateFinalConfidence({
        rcaQuality: rca.analysisQuality,
        dataQuality: rca.dataQuality,
        anomalyCount: anomalies.length,
        topCauseConfidence: rca.topCause.confidence,
      });

      const executionTime = Date.now() - startTime;

      const report: DiagnosticReport = {
        alert,
        generatedAt: new Date().toISOString(),
        service: serviceStatus,
        relatedServices,
        possibleCauses: rca.allCauses.length > 0
          ? rca.allCauses.map((c) => c.cause)
          : [rca.topCause.cause],
        rootCauseAnalysis: rca,
        metrics: metrics.slice(0, 10), // Últimos 10 puntos de data
        logs: logs.slice(0, 20), // Últimos 20 logs
        errorRate,
        confidence,
        executionTime,
        dataQuality: rca.dataQuality,
      };

      console.log(`[DIAGNOSTIC] ✅ Análisis completado en ${executionTime}ms:`, {
        service: report.service.name,
        topCause: rca.topCause.cause,
        confidence: (confidence * 100).toFixed(0) + "%",
        dataQuality: rca.dataQuality,
      });

      return report;
    } catch (error) {
      console.error("[DIAGNOSTIC] ❌ Error durante diagnóstico:", error);

      // Fallback a reporte degradado
      return this.createDegradedReport(alert);
    }
  }

  /**
   * Obtener status actual del servicio (REAL, no mock)
   */
  private async getServiceStatus(serviceName: string): Promise<ServiceStatus> {
    try {
      const snapshot = await this.stateProvider.getServiceStatus(
        serviceName,
        this.namespace
      );

      return {
        name: snapshot.name,
        replicas: snapshot.replicas,
        recentDeploy: snapshot.recentDeploy,
        deployedAt: snapshot.deployedAt,
        restartCount: snapshot.restartCount,
      };
    } catch (error) {
      console.warn(`[DIAGNOSTIC] Error obteniendo status de ${serviceName}:`, error);
      return {
        name: serviceName,
        replicas: { desired: 0, ready: 0 },
        recentDeploy: false,
        restartCount: 0,
      };
    }
  }

  /**
   * Obtener métricas históricas (últimas 2 horas)
   */
  private async getHistoricalMetrics(
    serviceName: string
  ): Promise<MetricTimeseries[]> {
    const timeRange = {
      start: new Date(Date.now() - 2 * 60 * 60 * 1000),
      end: new Date(),
      step: "1m",
    };

    const queries = [
      `container_cpu_usage_seconds_total{pod=~"${serviceName}.*"}`,
      `container_memory_usage_bytes{pod=~"${serviceName}.*"}`,
      `http_requests_total{job="${serviceName}"}`,
      `http_requests_total{job="${serviceName}",status=~"5.."}`,
      `http_request_duration_seconds{job="${serviceName}"}`,
    ];

    const allMetrics: MetricTimeseries[] = [];

    for (const query of queries) {
      try {
        const metrics = await this.metricsProvider.queryTimeseries(query, timeRange);
        allMetrics.push(...metrics);
      } catch (error) {
        console.warn(`[DIAGNOSTIC] Error querying metric ${query}:`, error);
        // Continuar con otras métricas
      }
    }

    return allMetrics;
  }

  /**
   * Obtener logs relevantes
   */
  private async getRelatedLogs(
    serviceName: string,
    alert: IncomingAlert
  ): Promise<any[]> {
    try {
      const keywords = this.extractKeywordsFromAlert(alert);

      const result = await this.logProvider.queryLogs(
        {
          service: serviceName,
          level: ["error", "warn"],
          keywords,
          namespace: this.namespace,
        },
        {
          start: new Date(Date.now() - 30 * 60 * 1000),
          end: new Date(),
        }
      );

      return result.entries;
    } catch (error) {
      console.warn("[DIAGNOSTIC] Error querying logs:", error);
      return [];
    }
  }

  /**
   * Obtener deployments recientes
   */
  private async getRecentDeployments(serviceName: string) {
    try {
      return await this.stateProvider.getDeploymentHistory(serviceName, 5);
    } catch (error) {
      console.warn("[DIAGNOSTIC] Error getting deployments:", error);
      return [];
    }
  }

  /**
   * Encontrar servicios relacionados
   */
  private async findRelatedServices(serviceName: string): Promise<string[]> {
    try {
      const deps = await this.stateProvider.getDependencies(serviceName);
      return deps.map((d) => d.name);
    } catch (error) {
      console.warn("[DIAGNOSTIC] Error finding related services:", error);
      return [];
    }
  }

  /**
   * Detectar anomalías en métricas
   */
  private detectAnomalies(metrics: MetricTimeseries[]): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];

    for (const ts of metrics) {
      if (ts.points.length < 10) continue; // Necesitar mínimo puntos

      const values = ts.points.map((p) => p.value);
      const mean = values.reduce((a, b) => a + b) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
      );

      // Si último valor > media + 2*stdDev, es anomalía
      const lastValue = values[values.length - 1];
      const threshold = mean + 2 * stdDev;

      if (lastValue > threshold) {
        const deviation = ((lastValue - mean) / mean) * 100;

        anomalies.push({
          metric: ts.name,
          severity:
            deviation > 100 ? "critical" : deviation > 50 ? "high" : "medium",
          reason: `${ts.name} increased from ${mean.toFixed(2)} to ${lastValue.toFixed(2)}`,
          value: lastValue,
          normalValue: mean,
          deviation,
        });
      }
    }

    return anomalies;
  }

  /**
   * Organizar métricas por nombre para RCA
   */
  private organizeMetrics(metrics: MetricTimeseries[]): Record<string, MetricTimeseries> {
    const organized: Record<string, MetricTimeseries> = {};

    for (const ts of metrics) {
      // Usar nombre + labels como key
      const key = ts.name + JSON.stringify(ts.labels);
      organized[key] = ts;
    }

    return organized;
  }

  /**
   * Calcular confianza final
   */
  private calculateFinalConfidence(params: {
    rcaQuality: number;
    dataQuality: string;
    anomalyCount: number;
    topCauseConfidence: number;
  }): number {
    const dataQualityScore =
      params.dataQuality === "high" ? 0.9 : params.dataQuality === "medium" ? 0.6 : 0.3;

    const anomalyScore = Math.min(params.anomalyCount / 3, 1);

    return (
      params.rcaQuality * 0.3 +
      dataQualityScore * 0.2 +
      anomalyScore * 0.2 +
      params.topCauseConfidence * 0.3
    );
  }

  /**
   * Extraer keywords de alerta para buscar en logs
   */
  private extractKeywordsFromAlert(alert: IncomingAlert): string[] {
    const keywords: string[] = [];

    // IncomingAlert only exposes `message` — extract meaningful words from it
    if (alert.message) {
      const words = alert.message.split(/\s+/).slice(0, 4);
      keywords.push(...words);
    }

    return keywords.filter((k) => k.length > 3);
  }

  /**
   * Reporte degradado si hay error
   */
  private createMockReport(alert: IncomingAlert): DiagnosticReport {
    const isApiGateway = alert.service === "api-gateway";
    const isAuthService = alert.service === "auth-service";

    if (isApiGateway) {
      const mockStatus = {
        name: "api-gateway",
        replicas: { desired: 3, ready: 3 },
        recentDeploy: true,
        deployedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        restartCount: 0,
      };

      const mockRca = {
        topCause: {
          cause: "Deployment reciente introdujo regresión en latencia",
          confidence: 0.88,
          indicators: [
            "Deployment: api-gateway-v1.4.2",
            "Error rate spike: 8.5%",
            "Coincidencia temporal exacta con el deploy (hace 15m)"
          ],
          severity: "high" as const,
          suggestedFixes: [
            "disable_feature_flag",
            "restart_service",
            "Rollback deployment"
          ]
        },
        allCauses: [
          {
            cause: "Deployment reciente introdujo regresión en latencia",
            confidence: 0.88,
            indicators: [
              "Deployment: api-gateway-v1.4.2",
              "Error rate spike: 8.5%"
            ],
            severity: "high" as const,
            suggestedFixes: ["disable_feature_flag", "Rollback deployment"]
          },
          {
            cause: "Resource exhaustion (CPU)",
            confidence: 0.45,
            indicators: ["CPU: 88%"],
            severity: "medium" as const,
            suggestedFixes: ["scale_replicas"]
          }
        ],
        analysisQuality: 0.9,
        dataQuality: "high" as const,
        suggestedActions: ["disable_feature_flag", "restart_service"]
      };

      return {
        alert,
        generatedAt: new Date().toISOString(),
        service: mockStatus,
        relatedServices: ["auth-service", "payments-db"],
        possibleCauses: ["Deployment reciente introdujo regresión en latencia", "Resource exhaustion (CPU)"],
        rootCauseAnalysis: mockRca,
        metrics: [
          { name: "cpu_usage", labels: {}, points: [{ timestamp: new Date(), value: 88 }] },
          { name: "latency", labels: {}, points: [{ timestamp: new Date(), value: 450 }] }
        ],
        logs: [
          { timestamp: new Date(), level: "error", service: alert.service, message: "Timeout connecting to auth-service at /validate" }
        ],
        errorRate: 0.085,
        confidence: 0.88,
        executionTime: 124,
        dataQuality: "high",
      };
    }

    if (isAuthService) {
      const mockStatus = {
        name: "auth-service",
        replicas: { desired: 3, ready: 1 },
        recentDeploy: false,
        restartCount: 5,
      };

      const mockRca = {
        topCause: {
          cause: "Replicas no están listas - posible crash loop en pods",
          confidence: 0.82,
          indicators: [
            "Ready replicas: 33%",
            "Restart count: 5"
          ],
          severity: "critical" as const,
          suggestedFixes: [
            "scale_replicas",
            "restart_service"
          ]
        },
        allCauses: [
          {
            cause: "Replicas no están listas - posible crash loop en pods",
            confidence: 0.82,
            indicators: ["Ready replicas: 33%"],
            severity: "critical" as const,
            suggestedFixes: ["scale_replicas", "restart_service"]
          }
        ],
        analysisQuality: 0.85,
        dataQuality: "high" as const,
        suggestedActions: ["scale_replicas", "restart_service"]
      };

      return {
        alert,
        generatedAt: new Date().toISOString(),
        service: mockStatus,
        relatedServices: ["payments-db"],
        possibleCauses: ["Replicas no están listas - posible crash loop en pods"],
        rootCauseAnalysis: mockRca,
        metrics: [],
        logs: [
          { timestamp: new Date(), level: "error", service: alert.service, message: "Fatal error: OutOfMemoryError in Heap Space" }
        ],
        errorRate: 0.12,
        confidence: 0.82,
        executionTime: 85,
        dataQuality: "high",
      };
    }

    // payments-db u otros
    const mockStatus = {
      name: alert.service,
      replicas: { desired: 1, ready: 1 },
      recentDeploy: false,
      restartCount: 0,
    };

    const mockRca = {
      topCause: {
        cause: "Conexiones máximas alcanzadas en Base de Datos",
        confidence: 0.55,
        indicators: [
          "Max connections exceeded error in logs",
          "High active connections in metrics"
        ],
        severity: "critical" as const,
        suggestedFixes: [
          "Aumentar max_connections",
          "Escalar verticalmente base de datos",
          "Revisar conexiones persistentes zombies"
        ]
      },
      allCauses: [],
      analysisQuality: 0.7,
      dataQuality: "medium" as const,
      suggestedActions: []
    };

    return {
      alert,
      generatedAt: new Date().toISOString(),
      service: mockStatus,
      relatedServices: [],
      possibleCauses: ["Conexiones máximas alcanzadas en Base de Datos"],
      rootCauseAnalysis: mockRca,
      metrics: [],
      logs: [
        { timestamp: new Date(), level: "error", service: alert.service, message: "FATAL: remaining connection slots are reserved for non-replication superuser connections" }
      ],
      errorRate: 0.05,
      confidence: 0.55,
      executionTime: 92,
      dataQuality: "medium",
    };
  }

  private createDegradedReport(alert: IncomingAlert): DiagnosticReport {
    return {
      alert,
      generatedAt: new Date().toISOString(),
      service: {
        name: alert.service,
        replicas: { desired: 0, ready: 0 },
        recentDeploy: false,
        restartCount: 0,
      },
      relatedServices: [],
      possibleCauses: ["Data providers unavailable - manual investigation required"],
      confidence: 0.2,
      executionTime: 0,
      dataQuality: "low",
    };
  }
}
