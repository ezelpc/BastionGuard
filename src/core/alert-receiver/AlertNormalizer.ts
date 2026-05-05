import { AlertSource, IncomingAlert, Severity } from "./types";
import { randomUUID } from "crypto";

export class AlertNormalizer {
  public normalize(source: AlertSource, payload: Record<string, unknown>): IncomingAlert {
    switch (source) {
      case "prometheus":
        return this.fromPrometheus(payload);
      case "grafana":
        return this.fromGrafana(payload);
      case "cloudwatch":
        return this.fromCloudwatch(payload);
      default:
        return this.fromCustom(payload);
    }
  }

  private fromPrometheus(p: Record<string, unknown>): IncomingAlert {
    const alerts = p.alerts as Array<Record<string, Record<string, string>>>;
    const first = alerts?.[0] ?? {};
    return {
      id: randomUUID(),
      source: "prometheus",
      severity: (first.labels?.severity ?? "medium") as Severity,
      service: first.labels?.job ?? "unknown",
      message: first.annotations?.summary ?? first.annotations?.description ?? "Sin descripción",
      receivedAt: new Date().toISOString(),
      rawPayload: p,
    };
  }

  private fromGrafana(p: Record<string, unknown>): IncomingAlert {
    return {
      id: randomUUID(),
      source: "grafana",
      severity: (p.state === "alerting" ? "high" : "low") as Severity,
      service: String(p.ruleName ?? "unknown"),
      message: String(p.message ?? p.title ?? "Sin descripción"),
      receivedAt: new Date().toISOString(),
      rawPayload: p,
    };
  }

  private fromCloudwatch(p: Record<string, unknown>): IncomingAlert {
    return {
      id: randomUUID(),
      source: "cloudwatch",
      severity: (p.NewStateValue === "ALARM" ? "critical" : "low") as Severity,
      service: String(p.AlarmName ?? "unknown"),
      message: String(p.NewStateReason ?? "Sin descripción"),
      receivedAt: new Date().toISOString(),
      rawPayload: p,
    };
  }

  private fromCustom(p: Record<string, unknown>): IncomingAlert {
    return {
      id: randomUUID(),
      source: "custom",
      severity: (p.severity ?? "medium") as Severity,
      service: String(p.service ?? "unknown"),
      message: String(p.message ?? "Sin descripción"),
      receivedAt: new Date().toISOString(),
      rawPayload: p,
    };
  }
}
