import { ActionName, ActionRequest, ActionResult, Provider } from "./types";

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
  "delete", "drop", "remove", "destroy",
  "purge", "force", "cascade", "truncate",
  "terminate", "kill", "wipe", "flush",
];

export class ActionExecutor {
  private dryRun: boolean;
  private auditLog: ActionResult[] = [];

  constructor(dryRun = true) {
    // Por defecto arranca en dryRun — nadie toca nada hasta que
    // explícitamente se desactive en config de producción
    this.dryRun = dryRun;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    const timestamp = new Date().toISOString();

    // — Guardrail 1: acción en allowlist?
    if (!ALLOWED_ACTIONS.has(request.action)) {
      return this.blocked(request, timestamp,
        `Acción '${request.action}' no está en la allowlist`
      );
    }

    // — Guardrail 2: params contienen palabras prohibidas?
    const paramsStr = JSON.stringify(request.params).toLowerCase();
    const forbidden = FORBIDDEN_KEYWORDS.find(k => paramsStr.includes(k));
    if (forbidden) {
      return this.blocked(request, timestamp,
        `Params contienen keyword prohibido: '${forbidden}'`
      );
    }

    // — Guardrail 3: solo la IA puede ejecutar, y en dryRun si no está configurado
    if (this.dryRun) {
      return this.simulatedResult(request, timestamp);
    }

    // — Ejecutar en el provider correcto
    return this.dispatch(request, timestamp);
  }

  private async dispatch(
    request: ActionRequest,
    timestamp: string
  ): Promise<ActionResult> {
    // Aquí conectaremos cada provider en pasos siguientes
    const result: ActionResult = {
      success: true,
      actionName: request.action,
      executedAt: timestamp,
      dryRun: false,
      details: `[${request.provider}] Ejecutando ${request.action}...`,
    };

    this.auditLog.push(result);
    console.log(`[AUDIT] tenant=${request.tenantId}`, result);
    return result;
  }

  private blocked(
    request: ActionRequest,
    timestamp: string,
    reason: string
  ): ActionResult {
    const result: ActionResult = {
      success: false,
      actionName: request.action,
      executedAt: timestamp,
      dryRun: this.dryRun,
      details: `BLOQUEADO — ${reason}`,
      error: reason,
    };

    // Aunque sea bloqueado, se audita
    this.auditLog.push(result);
    console.warn(`[BLOCKED] tenant=${request.tenantId} — ${reason}`);
    return result;
  }

  private simulatedResult(
    request: ActionRequest,
    timestamp: string
  ): ActionResult {
    const result: ActionResult = {
      success: true,
      actionName: request.action,
      executedAt: timestamp,
      dryRun: true,
      details: `[DRY-RUN] Se hubiera ejecutado: ${request.action} en ${request.provider}`,
    };

    this.auditLog.push(result);
    console.log(`[DRY-RUN] tenant=${request.tenantId}`, result);
    return result;
  }

  getAuditLog(): ActionResult[] {
    return this.auditLog;
  }
}