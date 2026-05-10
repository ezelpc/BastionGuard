import { EscalationManager } from "../EscalationManager";
import { DiagnosticReport } from "../../diagnostic-engine/types";
import { AIDecision } from "../../ai-agent/types";
import { IncomingAlert } from "../../alert-receiver/types";

// Mock dependencies that might not be installed in the test environment
jest.mock("pg", () => ({ Pool: jest.fn() }), { virtual: true });
jest.mock("twilio", () => jest.fn(), { virtual: true });

describe("EscalationManager", () => {
  let manager: EscalationManager;

  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
    manager = new EscalationManager();
  });

  const makeReport = (): DiagnosticReport => ({
    alert: {
      id: "test-id",
      source: "prometheus",
      severity: "critical",
      service: "api-gateway",
      message: "High latency detected",
      receivedAt: new Date().toISOString(),
      rawPayload: {},
    } as IncomingAlert,
    generatedAt: new Date().toISOString(),
    service: {
      name: "api-gateway",
      replicas: { desired: 3, ready: 2 },
      recentDeploy: true,
      restartCount: 1,
    },
    relatedServices: ["auth-service"],
    possibleCauses: ["Deploy reciente detectado"],
    confidence: 0.85,
  });

  const makeDecision = (overrides: Partial<AIDecision> = {}): AIDecision => ({
    shouldAct: false,
    reasoning: "No hay suficiente contexto",
    confidence: 0.4,
    escalate: true,
    escalationReason: "Confianza insuficiente",
    ...overrides,
  });

  describe("escalate", () => {
    it("debe crear evento de escalado", async () => {
      const event = await manager.escalate("empresa-a", makeReport(), makeDecision());

      expect(event.id).toBeDefined();
      expect(event.tenantId).toBe("empresa-a");
      expect(event.channel).toBe("slack");
      expect(event.sentAt).toBeDefined();
    });

    it("debe registrar en historial", async () => {
      await manager.escalate("empresa-a", makeReport(), makeDecision());
      await manager.escalate("empresa-a", makeReport(), makeDecision());

      expect(manager.getHistory().length).toBe(2);
    });

    it("debe construir mensaje con datos del incidente", async () => {
      const event = await manager.escalate("empresa-a", makeReport(), makeDecision());

      expect(event.message).toContain("api-gateway");
      expect(event.message).toContain("CRITICAL");
      expect(event.message).toContain("BastionGuard");
    });

    it("debe incluir motivo de escalado en mensaje", async () => {
      const event = await manager.escalate(
        "empresa-a",
        makeReport(),
        makeDecision({ escalationReason: "Test reason" })
      );

      expect(event.message).toContain("Test reason");
    });

    it("debe simular envío sin SLACK_WEBHOOK_URL", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await manager.escalate("empresa-a", makeReport(), makeDecision());

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("SLACK_WEBHOOK_URL no configurado")
      );

      consoleSpy.mockRestore();
    });

    it("debe incluir info de réplicas en mensaje", async () => {
      const event = await manager.escalate("empresa-a", makeReport(), makeDecision());

      expect(event.message).toContain("2/3");
    });
  });

  describe("getHistory", () => {
    it("debe retornar historial vacío inicialmente", () => {
      expect(manager.getHistory()).toEqual([]);
    });

    it("debe retornar todos los eventos", async () => {
      await manager.escalate("empresa-a", makeReport(), makeDecision());
      await manager.escalate("empresa-b", makeReport(), makeDecision());

      const history = manager.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].tenantId).toBe("empresa-a");
      expect(history[1].tenantId).toBe("empresa-b");
    });
  });
});
