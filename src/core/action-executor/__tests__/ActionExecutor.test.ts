import { ActionExecutor } from "../ActionExecutor";

describe("ActionExecutor", () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor(true); // dryRun mode
  });

  describe("execute", () => {
    it("debe permitir acciones en allowlist", async () => {
      const result = await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api-server" },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it("debe permitir acciones válidas", async () => {
      const result = await executor.execute({
        actionName: "scale_replicas",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "database", replicas: 3 },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(true);
    });

    it("debe registrar en audit log", async () => {
      await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "web" },
        requestedBy: "ai-agent",
      });

      const auditLog = executor.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[auditLog.length - 1].actionName).toBe("restart_service");
    });
  });

  describe("getAuditLog", () => {
    it("debe retornar array vacío inicialmente", () => {
      const log = executor.getAuditLog();
      expect(log).toEqual([]);
    });

    it("debe contener timestamp", async () => {
      await executor.execute({
        actionName: "scale_replicas",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api", replicas: 3 },
        requestedBy: "ai-agent",
      });

      const log = executor.getAuditLog();
      expect(log[0].executedAt).toBeDefined();
      expect(new Date(log[0].executedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("dryRun mode", () => {
    it("debe indicar dryRun en respuesta", async () => {
      const result = await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api" },
        requestedBy: "ai-agent",
      });

      expect(result.dryRun).toBe(true);
    });

    it("debe contener detalles de la acción", async () => {
      const result = await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api" },
        requestedBy: "ai-agent",
      });

      expect(result.details).toBeDefined();
      expect(result.details.length).toBeGreaterThan(0);
    });
  });
});
