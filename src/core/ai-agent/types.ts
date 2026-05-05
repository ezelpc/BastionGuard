import { ActionName, Provider } from "../action-executor/types";
import { DiagnosticReport } from "../diagnostic-engine/types";

export interface AIDecision {
  shouldAct: boolean;
  actionName?: ActionName;
  provider?: Provider;
  params?: Record<string, unknown>;
  reasoning: string;
  confidence: number;
  escalate: boolean;
  escalationReason?: string;
}

export interface AIDecisionRequest {
  report: DiagnosticReport;
  tenantId: string;
  attemptNumber: number; // cuántas veces se ha intentado resolver
}
