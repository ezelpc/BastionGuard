export type ActionName =
  | "restart_service"
  | "scale_replicas"
  | "disable_feature_flag"
  | "activate_fallback"
  | "create_alert"
  | "notify_slack";

export type Provider = "kubernetes" | "ecs" | "docker-swarm";

export interface ActionRequest {
  actionName: ActionName;
  provider: Provider;
  tenantId: string;
  params: Record<string, unknown>;
  requestedBy: "ai-agent" | "human";
}

export interface ActionResult {
  success: boolean;
  actionName: ActionName;
  executedAt: string;
  dryRun: boolean;
  details: string;
  error?: string;
}
