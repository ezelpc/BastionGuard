export type Severity = "critical" | "high" | "medium" | "low";

export type AlertSource = "prometheus" | "grafana" | "cloudwatch" | "datadog" | "custom";

export interface IncomingAlert {
  id: string;
  source: AlertSource;
  severity: Severity;
  service: string;
  message: string;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
}
