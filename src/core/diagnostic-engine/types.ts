import { IncomingAlert } from "../alert-receiver/types";

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
}
