import { AIDecision } from "../ai-agent/types";
import { DiagnosticReport } from "../diagnostic-engine/types";

export type EscalationChannel = "slack" | "pagerduty" | "email";

export interface EscalationEvent {
  id: string;
  tenantId: string;
  report: DiagnosticReport;
  decision: AIDecision;
  channel: EscalationChannel;
  sentAt: string;
  message: string;
}
