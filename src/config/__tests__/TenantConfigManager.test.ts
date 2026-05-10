import * as fs from "fs";
import * as path from "path";
import { TenantConfigManager } from "../TenantConfigManager";

describe("TenantConfigManager", () => {
  let manager: TenantConfigManager;
  let testConfigPath: string;

  beforeEach(() => {
    testConfigPath = path.join(__dirname, "test-tenant.yml");
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  describe("load", () => {
    it("debe cargar configuración válida desde YAML", async () => {
      const testYaml = `
tenants:
  - id: test-tenant
    name: Test Tenant
    enabled: true
    providers: []
    allowedActions: []
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
`;
      fs.writeFileSync(testConfigPath, testYaml);
      manager = new TenantConfigManager(testConfigPath);

      await manager.load();

      const tenant = manager.getTenant("test-tenant");
      expect(tenant.id).toBe("test-tenant");
      expect(tenant.name).toBe("Test Tenant");
    });

    it("debe lanzar error si archivo no existe", async () => {
      manager = new TenantConfigManager("/non/existent/path.yml");

      await expect(manager.load()).rejects.toThrow("no encontrado");
    });

    it("debe validar estructura de YAML", async () => {
      const invalidYaml = `
tenants: not-an-array
`;
      fs.writeFileSync(testConfigPath, invalidYaml);
      manager = new TenantConfigManager(testConfigPath);

      await expect(manager.load()).rejects.toThrow("array");
    });

    it("debe cargar múltiples tenants", async () => {
      const testYaml = `
tenants:
  - id: tenant-1
    name: Tenant 1
    enabled: true
    providers: []
    allowedActions: []
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
  - id: tenant-2
    name: Tenant 2
    enabled: true
    providers: []
    allowedActions: []
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.75
      maxAutoRemediate: 2
`;
      fs.writeFileSync(testConfigPath, testYaml);
      manager = new TenantConfigManager(testConfigPath);

      await manager.load();

      const all = manager.getAllTenants();
      expect(all.length).toBe(2);
    });
  });

  describe("getTenant", () => {
    beforeEach(async () => {
      const testYaml = `
tenants:
  - id: active-tenant
    name: Active Tenant
    enabled: true
    providers: []
    allowedActions:
      - name: restart
        allowed: true
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
  - id: disabled-tenant
    name: Disabled Tenant
    enabled: false
    providers: []
    allowedActions: []
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
`;
      fs.writeFileSync(testConfigPath, testYaml);
      manager = new TenantConfigManager(testConfigPath);
      await manager.load();
    });

    it("debe retornar tenant activo", () => {
      const tenant = manager.getTenant("active-tenant");
      expect(tenant.id).toBe("active-tenant");
    });

    it("debe lanzar error si tenant no existe", () => {
      expect(() => manager.getTenant("non-existent")).toThrow("no encontrado");
    });

    it("debe lanzar error si tenant está deshabilitado", () => {
      expect(() => manager.getTenant("disabled-tenant")).toThrow("deshabilitado");
    });
  });

  describe("isActionAllowed", () => {
    beforeEach(async () => {
      const testYaml = `
tenants:
  - id: test-tenant
    name: Test
    enabled: true
    providers: []
    allowedActions:
      - name: restart-service
        allowed: true
      - name: delete-service
        allowed: false
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
`;
      fs.writeFileSync(testConfigPath, testYaml);
      manager = new TenantConfigManager(testConfigPath);
      await manager.load();
    });

    it("debe retornar true para acción permitida", () => {
      const allowed = manager.isActionAllowed("test-tenant", "restart-service");
      expect(allowed).toBe(true);
    });

    it("debe retornar false para acción no permitida", () => {
      const allowed = manager.isActionAllowed("test-tenant", "delete-service");
      expect(allowed).toBe(false);
    });

    it("debe retornar false para acción inexistente", () => {
      const allowed = manager.isActionAllowed("test-tenant", "unknown-action");
      expect(allowed).toBe(false);
    });
  });

  describe("getActionPolicy", () => {
    beforeEach(async () => {
      const testYaml = `
tenants:
  - id: test-tenant
    name: Test
    enabled: true
    providers: []
    allowedActions:
      - name: scale-service
        allowed: true
        maxConcurrency: 5
        rateLimit:
          maxPerHour: 10
          maxPerDay: 30
    escalationTargets: {}
    aiThreshold:
      minConfidence: 0.8
      maxAutoRemediate: 3
`;
      fs.writeFileSync(testConfigPath, testYaml);
      manager = new TenantConfigManager(testConfigPath);
      await manager.load();
    });

    it("debe retornar política de acción", () => {
      const policy = manager.getActionPolicy("test-tenant", "scale-service");
      expect(policy?.maxConcurrency).toBe(5);
      expect(policy?.rateLimit?.maxPerHour).toBe(10);
    });

    it("debe retornar null para acción inexistente", () => {
      const policy = manager.getActionPolicy("test-tenant", "unknown");
      expect(policy).toBeNull();
    });
  });
});
