import { ActionName, ActionRequest, ActionResult } from "./types";

// ✅ Lo único que la IA puede pedir
const ALLOWED_ACTIONS: Set<ActionName> = new Set([
  "restart_service",
  "scale_replicas",
  "disable_feature_flag",
  "activate_fallback",
  "create_alert",
  "notify_slack",
]);

// 🚫 Palabras prohibidas — si aparecen en params, se bloquea todo
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

  constructor(dryRun = true) {
    this.dryRun = dryRun;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
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
    const result: ActionResult = {
      success: true,
      actionName: request.actionName,
      executedAt: timestamp,
      dryRun: false,
      details: `[${request.provider}] Ejecutando ${request.actionName}...`,
    };

    this.auditLog.push(result);
    console.log(`[AUDIT] tenant=${request.tenantId}`, result);
    return result;
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

  getAuditLog(): ActionResult[] {
    return this.auditLog;
  }
}
