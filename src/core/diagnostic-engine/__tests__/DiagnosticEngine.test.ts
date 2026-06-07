import { DiagnosticEngine } from "../DiagnosticEngine";
import { IncomingAlert, Severity } from "../../alert-receiver/types";
import {
  MetricsProvider,
  LogProvider,
  StateProvider,
  MetricData,
  MetricTimeseries,
  LogQueryResult,
  ServiceStatusSnapshot,
  Deployment,
  ServiceDependency,
} from "../data-sources/types";

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

const makeMetricsProvider = (): MetricsProvider => ({
  name: "mock-metrics",
  queryMetric: jest.fn().mockResolvedValue({ query: "", result: [], executionTime: 0 } as MetricData),
  queryTimeseries: jest.fn().mockResolvedValue([] as MetricTimeseries[]),
  getAvailableMetrics: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockResolvedValue(true),
});

const makeLogProvider = (): LogProvider => ({
  name: "mock-logs",
  queryLogs: jest.fn().mockResolvedValue({ entries: [], total: 0, executionTime: 0 } as LogQueryResult),
  getErrorRate: jest.fn().mockResolvedValue(0.05),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockResolvedValue(true),
});

/**
 * api-gateway: recent deploy + degraded replicas (ready < desired)
 * other services: no recent deploy, healthy replicas
 */
const makeStateProvider = (): StateProvider => ({
  name: "mock-state",
  getServiceStatus: jest.fn().mockImplementation(async (name: string): Promise<ServiceStatusSnapshot> => {
    if (name === "api-gateway") {
      return {
        name,
        replicas: { desired: 3, ready: 2 },
        recentDeploy: true,
        deployedAt: new Date().toISOString(),
        restartCount: 2,
        status: "Running",
        lastUpdate: new Date(),
      };
    }
    return {
      name,
      replicas: { desired: 2, ready: 2 },
      recentDeploy: false,
      restartCount: 0,
      status: "Running",
      lastUpdate: new Date(),
    };
  }),
  getDeploymentHistory: jest.fn().mockResolvedValue([
    { name: "deploy-1", timestamp: new Date(), version: "v1.2.3", replicas: 3 } as Deployment,
  ]),
  getDependencies: jest.fn().mockImplementation(async (name: string): Promise<ServiceDependency[]> => {
    if (name === "api-gateway") {
      return [
        { name: "auth-service", status: "healthy" },
        { name: "rate-limiter", status: "healthy" },
      ];
    }
    return [];
  }),
  findServicesByLabel: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockResolvedValue(true),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiagnosticEngine", () => {
  let engine: DiagnosticEngine;

  beforeEach(() => {
    engine = new DiagnosticEngine(
      makeMetricsProvider(),
      makeLogProvider(),
      makeStateProvider()
    );
  });

  const makeAlert = (service: string, severity = "critical"): IncomingAlert => ({
    id: "test-id",
    source: "prometheus",
    severity: severity as Severity,
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

    it("debe generar al menos una causa para servicio sin contexto", async () => {
      const report = await engine.diagnose(makeAlert("unknown-service", "critical"));

      // RCAEngine always returns at least the "unknown cause" top cause when no indicators fire
      expect(report.possibleCauses.length).toBeGreaterThan(0);
    });

    it("debe incluir timestamp en el reporte", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("debe detectar causa relacionada a replicas para api-gateway", async () => {
      const report = await engine.diagnose(makeAlert("api-gateway"));

      // RCAEngine reports degraded replicas as a possible cause
      const replicaCause = report.possibleCauses.find((c) =>
        c.toLowerCase().includes("replica") || c.toLowerCase().includes("crash")
      );
      expect(replicaCause).toBeDefined();
    });

    it("debe retornar reporte con confianza entre 0 y 1", async () => {
      const report = await engine.diagnose(makeAlert("payments-svc", "critical"));

      expect(report.confidence).toBeGreaterThanOrEqual(0);
      expect(report.confidence).toBeLessThanOrEqual(1);
    });
  });
});
