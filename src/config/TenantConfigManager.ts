import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { ActionPolicy, TenantConfig, TenantsConfig } from "./types";

export class TenantConfigManager {
  private tenants: Map<string, TenantConfig> = new Map();
  private configPath: string;

  public constructor(configPath: string = path.join(process.cwd(), "src/config/tenant.yml")) {
    this.configPath = configPath;
  }

  public async load(): Promise<void> {
    try {
      console.log(`[TENANT] Cargando configuración de tenants desde: ${this.configPath}`);

      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Archivo de configuración no encontrado: ${this.configPath}`);
      }

      const fileContent = fs.readFileSync(this.configPath, "utf-8");
      const config = yaml.parse(fileContent) as TenantsConfig;

      if (!config.tenants || !Array.isArray(config.tenants)) {
        throw new Error("YAML debe contener campo 'tenants' como array");
      }

      for (const tenant of config.tenants) {
        this.validateTenant(tenant);
        this.tenants.set(tenant.id, tenant);
        console.log(`✓ Tenant cargado: ${tenant.name} (${tenant.id})`);
      }

      console.log(`[TENANT] ${this.tenants.size} tenant(s) cargado(s) correctamente`);
    } catch (err) {
      console.error(`[TENANT] Error cargando configuración:`, err);
      throw err;
    }
  }

  public getTenant(tenantId: string): TenantConfig {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} no encontrado`);
    }
    if (!tenant.enabled) {
      throw new Error(`Tenant ${tenantId} está deshabilitado`);
    }
    return tenant;
  }

  public getAllTenants(): TenantConfig[] {
    return Array.from(this.tenants.values()).filter((t) => t.enabled);
  }

  public isActionAllowed(tenantId: string, actionName: string): boolean {
    try {
      const tenant = this.getTenant(tenantId);
      const policy = tenant.allowedActions.find((a) => a.name === actionName);
      return policy ? policy.allowed : false;
    } catch {
      return false;
    }
  }

  public getActionPolicy(tenantId: string, actionName: string): ActionPolicy | null {
    try {
      const tenant = this.getTenant(tenantId);
      return tenant.allowedActions.find((a) => a.name === actionName) ?? null;
    } catch {
      return null;
    }
  }

  public getProviderConfig(tenantId: string, providerName: string): Record<string, unknown> | null {
    try {
      const tenant = this.getTenant(tenantId);
      const provider = tenant.providers.find((p) => p.name === providerName && p.enabled);
      return provider?.config ?? null;
    } catch {
      return null;
    }
  }

  public getEscalationTargets(tenantId: string): TenantConfig["escalationTargets"] {
    try {
      const tenant = this.getTenant(tenantId);
      return tenant.escalationTargets;
    } catch {
      return {};
    }
  }

  public getAIThreshold(tenantId: string): TenantConfig["aiThreshold"] {
    try {
      const tenant = this.getTenant(tenantId);
      return tenant.aiThreshold;
    } catch {
      return { minConfidence: 0.8, maxAutoRemediate: 3 };
    }
  }

  private validateTenant(tenant: TenantConfig): void {
    if (!tenant.id || !tenant.name) {
      throw new Error("Tenant debe tener 'id' y 'name'");
    }
    if (!Array.isArray(tenant.providers)) {
      throw new Error(`Tenant ${tenant.id}: 'providers' debe ser un array`);
    }
    if (!Array.isArray(tenant.allowedActions)) {
      throw new Error(`Tenant ${tenant.id}: 'allowedActions' debe ser un array`);
    }
    if (!tenant.aiThreshold || typeof tenant.aiThreshold.minConfidence !== "number") {
      throw new Error(`Tenant ${tenant.id}: aiThreshold.minConfidence debe ser un número`);
    }
  }
}
