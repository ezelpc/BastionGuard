export interface ActionPolicy {
  name: string;
  allowed: boolean;
  maxConcurrency?: number;
  rateLimit?: {
    maxPerHour: number;
    maxPerDay: number;
  };
  requiresApproval?: boolean;
}

export interface ProviderConfig {
  name: "kubernetes" | "ecs" | "docker-swarm";
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface TenantConfig {
  id: string;
  name: string;
  enabled: boolean;
  providers: ProviderConfig[];
  allowedActions: ActionPolicy[];
  escalationTargets: {
    slack?: string; // webhook URL
    email?: string[];
    pagerduty?: string; // integration key
  };
  aiThreshold: {
    minConfidence: number; // 0-1
    maxAutoRemediate: number; // max remediation attempts before escalate
  };
}

export interface TenantsConfig {
  tenants: TenantConfig[];
}
