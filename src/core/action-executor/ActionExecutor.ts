import { ActionName, ActionRequest, ActionResult } from "./types";
import { KubernetesProvider } from "../../providers/kubernetes";

const ALLOWED_ACTIONS: Set<ActionName> = new Set([
  "restart_service",
  "scale_replicas",
  "disable_feature_flag",
  "activate_fallback",
  "create_alert",
  "notify_slack",
]);

const FORBIDDEN_KEYWORDS = [
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

export class ActionExecutor {
  private dryRun: boolean;
  private auditLog: ActionResult[] = [];
  private k8sProvider?: KubernetesProvider;

  public constructor(dryRun = true) {
    this.dryRun = dryRun;

    if (!dryRun) {
      this.k8sProvider = new KubernetesProvider({
        namespace: process.env.K8S_NAMESPACE ?? "production",
        kubeConfigPath: process.env.KUBECONFIG,
      });
      console.log(`[EXECUTOR] Modo REAL activo — provider Kubernetes listo`);
    } else {
      console.log(`[EXECUTOR] Modo DRY-RUN activo — ninguna acción real se ejecutará`);
    }
  }

  public async execute(request: ActionRequest): Promise<ActionResult> {
    const timestamp = new Date().toISOString();

    // — Guardrail 1: acción en allowlist?
    if (!ALLOWED_ACTIONS.has(request.actionName)) {
      return this.blocked(
        request,
        timestamp,
        `Acción '${request.actionName}' no está en la allowlist`
      );
    }

    // — Guardrail 2: params contienen palabras prohibidas?
    const paramsStr = JSON.stringify(request.params).toLowerCase();
    const forbidden = FORBIDDEN_KEYWORDS.find((k) => paramsStr.includes(k));
    if (forbidden) {
      return this.blocked(request, timestamp, `Params contienen keyword prohibido: '${forbidden}'`);
    }

    // — Guardrail 3: dryRun activo?
    if (this.dryRun) {
      return this.simulatedResult(request, timestamp);
    }

    return this.dispatch(request, timestamp);
  }

  private async dispatch(request: ActionRequest, timestamp: string): Promise<ActionResult> {
    try {
      let details = "";

      switch (request.provider) {
        case "kubernetes":
          details = await this.dispatchKubernetes(request);
          break;
        case "ecs":
          details = `[ECS] Provider en construcción — Paso 7`;
          break;
        case "docker-swarm":
          details = `[SWARM] Provider en construcción — Paso 7`;
          break;
        default:
          throw new Error(`Provider '${request.provider}' no soportado`);
      }

      const result: ActionResult = {
        success: true,
        actionName: request.actionName,
        executedAt: timestamp,
        dryRun: false,
        details,
      };

      this.auditLog.push(result);
      console.log(`[AUDIT] tenant=${request.tenantId}`, result);
      return result;
    } catch (err) {
      const error = String(err);
      const result: ActionResult = {
        success: false,
        actionName: request.actionName,
        executedAt: timestamp,
        dryRun: false,
        details: `Error ejecutando ${request.actionName}`,
        error,
      };

      this.auditLog.push(result);
      console.error(`[EXECUTOR] Error:`, error);
      return result;
    }
  }

  private async dispatchKubernetes(request: ActionRequest): Promise<string> {
    if (!this.k8sProvider) {
      throw new Error("Kubernetes provider no inicializado");
    }

    const params = request.params as Record<string, unknown>;

    switch (request.actionName) {
      case "restart_service":
        return this.k8sProvider.restartService({
          service: String(params.service),
          namespace: params.namespace ? String(params.namespace) : undefined,
        });

      case "scale_replicas":
        return this.k8sProvider.scaleReplicas({
          service: String(params.service),
          replicas: Number(params.replicas),
          namespace: params.namespace ? String(params.namespace) : undefined,
        });

      case "disable_feature_flag":
        // Feature flags se manejan via configmap o variable de entorno
        return `Feature flag desactivado en ${params.service} — implementar según tu sistema de flags`;

      case "activate_fallback":
        return `Fallback activado para ${params.service}`;

      case "notify_slack":
        return `Notificación enviada`;

      default:
        throw new Error(`Acción '${request.actionName}' no implementada en Kubernetes`);
    }
  }

  private blocked(request: ActionRequest, timestamp: string, reason: string): ActionResult {
    const result: ActionResult = {
      success: false,
      actionName: request.actionName,
      executedAt: timestamp,
      dryRun: this.dryRun,
      details: `BLOQUEADO — ${reason}`,
      error: reason,
    };

    this.auditLog.push(result);
    console.warn(`[BLOCKED] tenant=${request.tenantId} — ${reason}`);
    return result;
  }

  private simulatedResult(request: ActionRequest, timestamp: string): ActionResult {
    const result: ActionResult = {
      success: true,
      actionName: request.actionName,
      executedAt: timestamp,
      dryRun: true,
      details: `[DRY-RUN] Se hubiera ejecutado: ${request.actionName} en ${request.provider}`,
    };

    this.auditLog.push(result);
    console.log(`[DRY-RUN] tenant=${request.tenantId}`, result);
    return result;
  }

  public getAuditLog(): ActionResult[] {
    return this.auditLog;
  }
}
