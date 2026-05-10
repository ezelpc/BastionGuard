import { AIDecisionAgent } from "../AIDecisionAgent";
import { DiagnosticReport } from "../../diagnostic-engine/types";
import { IncomingAlert } from "../../alert-receiver/types";

describe("AIDecisionAgent", () => {
  let agent: AIDecisionAgent;

  beforeEach(() => {
    process.env.AI_MOCK = "true";
    agent = new AIDecisionAgent();
  });

  const makeReport = (overrides: Partial<DiagnosticReport> = {}): DiagnosticReport => ({
    alert: {
      id: "test-id",
      source: "prometheus",
      severity: "critical",
      service: "api-gateway",
      message: "High latency",
      receivedAt: new Date().toISOString(),
      rawPayload: {},
    } as IncomingAlert,
    generatedAt: new Date().toISOString(),
    service: {
      name: "api-gateway",
      replicas: { desired: 3, ready: 2 },
      recentDeploy: true,
      deployedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      restartCount: 1,
    },
    relatedServices: ["auth-service"],
    possibleCauses: ["Deploy reciente detectado"],
    confidence: 0.85,
    ...overrides,
  });

  describe("decide - mock mode", () => {
    it("debe actuar con deploy reciente y confianza alta", async () => {
      const decision = await agent.decide({
        report: makeReport(),
        tenantId: "empresa-a",
        attemptNumber: 1,
      });

      expect(decision.shouldAct).toBe(true);
      expect(decision.actionName).toBe("disable_feature_flag");
      expect(decision.escalate).toBe(false);
    });

    it("debe escalar con confianza baja sin deploy reciente", async () => {
      const decision = await agent.decide({
        report: makeReport({
          service: {
            name: "payments-svc",
            replicas: { desired: 2, ready: 2 },
            recentDeploy: false,
            restartCount: 0,
          },
          confidence: 0.3,
          possibleCauses: [],
        }),
        tenantId: "empresa-a",
        attemptNumber: 1,
      });

      expect(decision.escalate).toBe(true);
      expect(decision.shouldAct).toBe(false);
    });

    it("debe escalar al alcanzar máximo de intentos", async () => {
      const decision = await agent.decide({
        report: makeReport(),
        tenantId: "empresa-a",
        attemptNumber: 3,
      });

      expect(decision.escalate).toBe(true);
      expect(decision.escalationReason).toContain("Máximo");
    });

    it("debe sugerir scale_replicas con réplicas degradadas", async () => {
      const decision = await agent.decide({
        report: makeReport({
          service: {
            name: "api-gateway",
            replicas: { desired: 3, ready: 1 },
            recentDeploy: false,
            restartCount: 0,
          },
          confidence: 0.75,
        }),
        tenantId: "empresa-a",
        attemptNumber: 1,
      });

      expect(decision.shouldAct).toBe(true);
      expect(decision.actionName).toBe("scale_replicas");
    });

    it("debe incluir reasoning en la decisión", async () => {
      const decision = await agent.decide({
        report: makeReport(),
        tenantId: "empresa-a",
        attemptNumber: 1,
      });

      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(0);
    });

    it("debe incluir confidence en la decisión", async () => {
      const decision = await agent.decide({
        report: makeReport(),
        tenantId: "empresa-a",
        attemptNumber: 1,
      });

      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });
  });
});
