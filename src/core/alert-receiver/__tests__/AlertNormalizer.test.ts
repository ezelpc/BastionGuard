import { AlertNormalizer } from "../AlertNormalizer";

describe("AlertNormalizer", () => {
  let normalizer: AlertNormalizer;

  beforeEach(() => {
    normalizer = new AlertNormalizer();
  });

  describe("normalize", () => {
    it("debe normalizar alerta de Prometheus", () => {
      const prometheusPayload = {
        alerts: [
          {
            status: "firing",
            labels: {
              alertname: "HighCPU",
              service: "api-server",
            },
            annotations: {
              summary: "High CPU usage detected",
            },
          },
        ],
      };

      const alert = normalizer.normalize("prometheus", prometheusPayload);

      expect(alert.source).toBe("prometheus");
      expect(alert.severity).toBeDefined();
      expect(alert.message).toBeDefined();
    });

    it("debe normalizar alerta de Grafana", () => {
      const grafanaPayload = {
        status: "alerting",
        title: "Memory Alert",
        ruleId: 1,
        labels: {
          service: "database",
        },
        message: "Memory usage is critical",
      };

      const alert = normalizer.normalize("grafana", grafanaPayload);

      expect(alert.source).toBe("grafana");
      expect(alert.severity).toBeDefined();
    });

    it("debe normalizar alerta de CloudWatch", () => {
      const cloudwatchPayload = {
        AlarmName: "DynamoDB-Throttling",
        NewStateValue: "ALARM",
        StateChangeTime: new Date().toISOString(),
        Region: "us-east-1",
        AlarmDescription: "DynamoDB table is being throttled",
      };

      const alert = normalizer.normalize("cloudwatch", cloudwatchPayload);

      expect(alert.source).toBe("cloudwatch");
      expect(alert.severity).toBeDefined();
    });

    it("debe normalizar alerta personalizada", () => {
      const customPayload = {
        service_name: "auth-service",
        error_count: 150,
        threshold: 100,
        timestamp: new Date().toISOString(),
      };

      const alert = normalizer.normalize("custom", customPayload);

      expect(alert.source).toBe("custom");
      expect(alert.severity).toBeDefined();
    });

    it("debe asignar ID único a cada alerta", () => {
      const payload = { service: "test" };

      const alert1 = normalizer.normalize("custom", payload);
      const alert2 = normalizer.normalize("custom", payload);

      expect(alert1.id).not.toBe(alert2.id);
    });

    it("debe establecer timestamp", () => {
      const alert = normalizer.normalize("custom", { service: "test" });

      expect(alert.receivedAt).toBeDefined();
      const alertTime = new Date(alert.receivedAt).getTime();
      const now = Date.now();

      expect(Math.abs(alertTime - now)).toBeLessThan(1000); // within 1 second
    });
  });

  describe("severity mapping", () => {
    it("debe mapear severidad alta", () => {
      const payload = {
        alerts: [
          {
            status: "firing",
            labels: { severity: "critical", service: "prod" },
            annotations: { summary: "Critical issue" },
          },
        ],
      };

      const alert = normalizer.normalize("prometheus", payload);
      expect(alert.severity).toBe("critical");
    });

    it("debe mapear severidad media por defecto", () => {
      const payload = { service: "api" };
      const alert = normalizer.normalize("custom", payload);

      expect(["low", "medium", "high", "critical"]).toContain(alert.severity);
    });
  });
});
