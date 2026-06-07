/**
 * Root Cause Analysis Engine
 * Analiza múltiples factores para determinar la causa raíz de un incidente
 */

import { IncomingAlert } from '../../alert-receiver/types';
import {
    Deployment,
    LogEntry,
    MetricTimeseries,
    ServiceStatusSnapshot
} from '../data-sources/types';

export interface RCAContext {
  alert: IncomingAlert;
  serviceStatus: ServiceStatusSnapshot;
  metrics: Record<string, MetricTimeseries>; // name -> timeseries
  logs: LogEntry[];
  recentDeployments: Deployment[];
  errorRate: number; // 0-1
  anomalies: AnomalyDetection[];
}

export interface AnomalyDetection {
  metric: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  value: number;
  normalValue: number;
  deviation: number; // percentage
}

export interface RootCauseAnalysis {
  topCause: PossibleCause;
  allCauses: PossibleCause[];
  analysisQuality: number; // 0-1
  dataQuality: 'high' | 'medium' | 'low';
  suggestedActions: string[];
}

export interface PossibleCause {
  cause: string;
  confidence: number; // 0-1
  indicators: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedFixes: string[];
}

export class RCAEngine {
  /**
   * Analizar contexto para determinar causa raíz
   */
  static analyze(context: RCAContext): RootCauseAnalysis {
    const causes: PossibleCause[] = [];
    const indicators: string[] = [];

    // ============================================================
    // ANÁLISIS 1: Deployments Recientes
    // ============================================================
    if (context.recentDeployments.length > 0) {
      const recentDeploy = context.recentDeployments[0];
      const hoursAgo = (Date.now() - recentDeploy.timestamp.getTime()) / (1000 * 60 * 60);

      if (hoursAgo < 1) {
        indicators.push(`Deployment hace ${Math.round(hoursAgo * 60)} minutos`);

        // Si el error rate es alto, probable que sea causa
        if (context.errorRate > 0.05) {
          causes.push({
            cause: 'Deployment reciente introdujo bug o regressión',
            confidence: Math.min(0.95, 0.7 + context.errorRate),
            indicators: [
              `Deployment: ${recentDeploy.name}`,
              `Error rate spike: ${(context.errorRate * 100).toFixed(2)}%`,
              'Timing coincide',
            ],
            severity: context.errorRate > 0.2 ? 'critical' : 'high',
            suggestedFixes: [
              'Rollback a versión anterior',
              'Escalar para investigar',
              'Ejecutar canarios en testing',
            ],
          });
        }
      }
    }

    // ============================================================
    // ANÁLISIS 2: Exhaustión de Recursos
    // ============================================================
    const cpuAnomaly = context.anomalies.find((a) => a.metric.includes('cpu'));
    const memoryAnomaly = context.anomalies.find((a) => a.metric.includes('memory'));

    if (cpuAnomaly || memoryAnomaly) {
      const resourceType = cpuAnomaly ? 'CPU' : 'Memory';
      const anomaly = cpuAnomaly || memoryAnomaly;

      indicators.push(`${resourceType} spike: ${anomaly?.deviation}%`);

      causes.push({
        cause: `${resourceType} exhaustion - servicio sin recursos`,
        confidence: Math.min(0.9, 0.5 + anomaly!.deviation / 100),
        indicators: [
          `${resourceType}: ${anomaly?.value}% (normal: ${anomaly?.normalValue}%)`,
          'Replica ready count bajo',
        ],
        severity: anomaly!.severity,
        suggestedFixes: [
          `Escalar replicas (horizontal scaling)`,
          `Aumentar limites de ${resourceType}`,
          'Optimizar código/queries',
        ],
      });
    }

    // ============================================================
    // ANÁLISIS 3: Problemas con Deployments
    // ============================================================
    if (context.serviceStatus.replicas.ready < context.serviceStatus.replicas.desired) {
      const readyPercent =
        (context.serviceStatus.replicas.ready / context.serviceStatus.replicas.desired) * 100;

      indicators.push(
        `Replicas: ${context.serviceStatus.replicas.ready}/${context.serviceStatus.replicas.desired}`
      );

      causes.push({
        cause: 'Replicas no están listos - posible crash loop',
        confidence: 0.8,
        indicators: [
          `Ready replicas: ${readyPercent.toFixed(0)}%`,
          `Restart count: ${context.serviceStatus.restartCount}`,
        ],
        severity: readyPercent < 50 ? 'critical' : 'high',
        suggestedFixes: [
          'Revisar logs de pods para crashloop',
          'Validar health checks',
          'Revisar readiness probes',
        ],
      });
    }

    // ============================================================
    // ANÁLISIS 4: Errores en Logs
    // ============================================================
    const errorLogs = context.logs.filter((l) => l.level === 'error');

    if (errorLogs.length > 0) {
      const errorPatterns = this.identifyErrorPatterns(errorLogs);

      for (const pattern of errorPatterns) {
        indicators.push(`Error pattern: ${pattern.pattern}`);

        causes.push({
          cause: `Aplicación errando: ${pattern.pattern}`,
          confidence: 0.75,
          indicators: [
            `${pattern.count} errores en últimas 2 horas`,
            pattern.example,
          ],
          severity: pattern.count > 100 ? 'critical' : 'high',
          suggestedFixes: [
            'Revisar código de la aplicación',
            'Verificar dependencias externas',
            'Escalar al equipo de desarrollo',
          ],
        });
      }
    }

    // ============================================================
    // ANÁLISIS 5: Problemas de Conectividad/Dependencias
    // ============================================================
    if (context.alert.message?.includes('timeout') ||
        context.alert.message?.includes('connection')) {
      indicators.push('Alert menciona timeout/connection');

      causes.push({
        cause: 'Problema de conectividad o dependencia degradada',
        confidence: 0.7,
        indicators: [
          'Alert contiene keywords de conectividad',
          'Posible timeout en llamadas externas',
        ],
        severity: 'high',
        suggestedFixes: [
          'Verificar estado de dependencias (DB, APIs externas)',
          'Revisar configuración de timeouts',
          'Escalar al equipo de infraestructura',
        ],
      });
    }

    // ============================================================
    // ANÁLISIS 6: Anomalías Generales
    // ============================================================
    for (const anomaly of context.anomalies) {
      if (anomaly.severity === 'critical') {
        indicators.push(`Critical anomaly: ${anomaly.metric} deviated ${anomaly.deviation}%`);

        causes.push({
          cause: `Anomalía crítica: ${anomaly.metric}`,
          confidence: 0.6 + Math.min(0.3, anomaly.deviation / 200),
          indicators: [
            anomaly.reason,
            `Desviación: ${anomaly.deviation.toFixed(0)}%`,
          ],
          severity: anomaly.severity,
          suggestedFixes: [
            'Investigar la causa de la anomalía',
            'Correlacionar con cambios recientes',
          ],
        });
      }
    }

    // ============================================================
    // ORDENAR Y FILTRAR
    // ============================================================

    // Remover duplicados
    const uniqueCauses = Array.from(
      new Map(causes.map((c) => [c.cause, c])).values()
    );

    // Ordenar por confianza
    uniqueCauses.sort((a, b) => b.confidence - a.confidence);

    // Calcular quality score
    const analysisQuality = Math.min(
      1.0,
      (Object.keys(context.metrics).length / 5) * 0.3 +
        (Math.min(context.logs.length, 100) / 100) * 0.3 +
        (uniqueCauses.length / 5) * 0.4
    );

    const topCause = uniqueCauses[0] || {
      cause: 'Causa desconocida - análisis incompleto',
      confidence: 0.3,
      indicators,
      severity: 'medium',
      suggestedFixes: [
        'Revisar dashboard de monitoreo',
        'Escalar al equipo de SRE',
      ],
    };

    const suggestedActions = this.deduplicateActions(
      uniqueCauses.flatMap((c) => c.suggestedFixes)
    );

    return {
      topCause,
      allCauses: uniqueCauses,
      analysisQuality,
      dataQuality: this.assessDataQuality(context),
      suggestedActions,
    };
  }

  /**
   * Detectar patrones en errores
   */
  private static identifyErrorPatterns(
    logs: LogEntry[]
  ): Array<{ pattern: string; count: number; example: string }> {
    const patterns = new Map<string, { count: number; examples: string[] }>();

    for (const log of logs) {
      // Extraer pattern (primeras 50 chars o hasta primera variable)
      const pattern = log.message.substring(0, Math.min(50, log.message.length));

      if (!patterns.has(pattern)) {
        patterns.set(pattern, { count: 0, examples: [] });
      }

      const p = patterns.get(pattern)!;
      p.count++;
      if (p.examples.length < 3) {
        p.examples.push(log.message);
      }
    }

    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        example: data.examples[0] || pattern,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3); // Top 3 patterns
  }

  /**
   * Deduplica acciones sugeridas
   */
  private static deduplicateActions(actions: string[]): string[] {
    return Array.from(new Set(actions)).slice(0, 5);
  }

  /**
   * Evalúa la calidad de los datos para confianza
   */
  private static assessDataQuality(context: RCAContext): 'high' | 'medium' | 'low' {
    const metricsCount = Object.keys(context.metrics).length;
    const logsCount = context.logs.length;
    const hasRecentData =
      context.logs.length > 0 &&
      new Date().getTime() - context.logs[0].timestamp.getTime() < 5 * 60 * 1000; // últimos 5 min

    if (metricsCount >= 3 && logsCount >= 10 && hasRecentData) {
      return 'high';
    } else if (metricsCount >= 1 && logsCount >= 1) {
      return 'medium';
    }
    return 'low';
  }
}
