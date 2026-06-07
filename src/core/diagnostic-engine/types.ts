import { IncomingAlert } from "../alert-receiver/types";
import { LogEntry, MetricTimeseries } from "./data-sources/types";
import { RootCauseAnalysis } from "./rca-engine/RCAEngine";

export interface ServiceStatus {
  name: string;
  replicas: { desired: number; ready: number };
  recentDeploy: boolean;
  deployedAt?: string;
  restartCount: number;
}

export interface DiagnosticReport {
  alert: IncomingAlert;
  generatedAt: string;
  service: ServiceStatus;
  relatedServices: string[];
  possibleCauses: string[];
  confidence: number; // 0 a 1 — qué tan seguro está el diagnóstico
  
  // NUEVO: Datos detallados (para IA y dashboard)
  rootCauseAnalysis?: RootCauseAnalysis;
  metrics?: MetricTimeseries[]; // Últimos 10 puntos de data
  logs?: LogEntry[]; // Últimos 20 logs relevantes
  errorRate?: number; // 0-1
  executionTime?: number; // ms
  dataQuality?: 'high' | 'medium' | 'low';
}
