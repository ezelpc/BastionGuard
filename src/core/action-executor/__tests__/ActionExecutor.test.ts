import { ActionExecutor } from "../ActionExecutor";

describe("ActionExecutor", () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor(true); // dryRun mode
  });

  describe("execute — allowlist guardrail", () => {
    it("debe permitir restart_service (en allowlist)", async () => {
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

    it("debe permitir scale_replicas (en allowlist)", async () => {
      const result = await executor.execute({
        actionName: "scale_replicas",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "database", replicas: 3 },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(true);
    });

    it("debe bloquear acción que no está en allowlist", async () => {
      const result = await executor.execute({
        actionName: "deploy_service" as never,
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api" },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(false);
      expect(result.details).toContain("BLOQUEADO");
      expect(result.error).toContain("allowlist");
    });

    it("debe bloquear acción desconocida y registrarla en audit log", async () => {
      await executor.execute({
        actionName: "nuke_everything" as never,
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: {},
        requestedBy: "ai-agent",
      });

      const log = executor.getAuditLog();
      expect(log[log.length - 1].success).toBe(false);
    });
  });

  describe("execute — forbidden keyword guardrail", () => {
    const FORBIDDEN = [
      "delete",
      "drop",
      "remove",
      "destroy",
      "purge",
      "force",
      "cascade",
      "truncate",
      "terminate",
      "kill",
      "wipe",
      "flush",
    ];

    it.each(FORBIDDEN)("debe bloquear params que contienen '%s'", async (keyword) => {
      const result = await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api", operation: keyword },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(false);
      expect(result.details).toContain("BLOQUEADO");
      expect(result.error).toContain(keyword);
    });

    it("debe permitir params sin keywords prohibidas", async () => {
      const result = await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "api-gateway", reason: "health-check" },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("execute — dryRun mode (todos los action types)", () => {
    const allActions = [
      "restart_service",
      "scale_replicas",
      "disable_feature_flag",
      "activate_fallback",
      "create_alert",
      "notify_slack",
    ] as const;

    it.each(allActions)("debe simular '%s' en dryRun sin error", async (action) => {
      const result = await executor.execute({
        actionName: action,
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "svc", replicas: 2 },
        requestedBy: "ai-agent",
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.details).toContain("[DRY-RUN]");
    });

    it("debe incluir nombre de provider en detalles del dry-run", async () => {
      const result = await executor.execute({
        actionName: "scale_replicas",
        provider: "ecs",
        tenantId: "empresa-a",
        params: { service: "worker", replicas: 5 },
        requestedBy: "ai-agent",
      });

      expect(result.details).toContain("scale_replicas");
      expect(result.details).toContain("ecs");
    });
  });

  describe("getAuditLog", () => {
    it("debe retornar array vacío inicialmente", () => {
      expect(executor.getAuditLog()).toEqual([]);
    });

    it("debe contener timestamp válido", async () => {
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

    it("debe acumular múltiples entradas incluyendo bloqueadas", async () => {
      await executor.execute({
        actionName: "restart_service",
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: { service: "web" },
        requestedBy: "ai-agent",
      });
      await executor.execute({
        actionName: "bad_action" as never,
        provider: "kubernetes",
        tenantId: "empresa-a",
        params: {},
        requestedBy: "ai-agent",
      });

      const log = executor.getAuditLog();
      expect(log).toHaveLength(2);
      expect(log[0].success).toBe(true);
      expect(log[1].success).toBe(false);
    });
  });
});
