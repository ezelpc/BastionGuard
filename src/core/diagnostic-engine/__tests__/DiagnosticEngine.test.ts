import { DiagnosticEngine } from "../DiagnosticEngine";
import { IncomingAlert } from "../../alert-receiver/types";

describe("DiagnosticEngine", () => {
  let engine: DiagnosticEngine;

  beforeEach(() => {
    engine = new DiagnosticEngine();
  });

  const makeAlert = (service: string, severity = "critical"): IncomingAlert => ({
    id: "test-id",
    source: "prometheus",
    severity: severity as any,
    service,
    message: "Test alert",
    receivedAt: new Date().toISOString(),
    rawPayload: {},
  });

  describe("diagnose", () => {
    it("debe generar reporte para api-gateway", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.service.name).toBe("api-gateway");
      expect(report.possibleCauses.length).toBeGreaterThan(0);
      expect(report.confidence).toBeGreaterThan(0);
      expect(report.confidence).toBeLessThanOrEqual(1);
    });

    it("debe detectar deploy reciente en api-gateway", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.service.recentDeploy).toBe(true);
      expect(report.possibleCauses).toContain("Deploy reciente detectado — posible regresión");
    });

    it("debe detectar réplicas degradadas", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.service.replicas.ready).toBeLessThan(report.service.replicas.desired);
    });

    it("debe encontrar servicios relacionados para api-gateway", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.relatedServices).toContain("auth-service");
      expect(report.relatedServices).toContain("rate-limiter");
    });

    it("debe generar causa desconocida para servicio sin contexto", async () => {
      const report = await engine.diagnose(makeAlert("unknown-service", "critical"));

      expect(report.possibleCauses).toContain("Causa desconocida — requiere investigación manual");
    });

    it("debe incluir timestamp en el reporte", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("debe tener confianza alta con deploy reciente", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("debe tener confianza baja sin contexto", async () => {
      const report = await engine.diagnose(makeAlert("payments-svc", "critical"));

      expect(report.confidence).toBeLessThan(0.6);
    });
  });
});
