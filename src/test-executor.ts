import { ActionExecutor } from "./core/action-executor/ActionExecutor";

const executor = new ActionExecutor(true); // dryRun activado

async function run() {
  // ✅ Esto debe pasar
  const r1 = await executor.execute({
    action: "restart_service",
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { service: "api-gateway", namespace: "production" },
    requestedBy: "ai-agent",
  });
  console.log(r1);

  // 🚫 Esto debe ser bloqueado
  const r2 = await executor.execute({
    action: "restart_service",
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { service: "api-gateway", force_delete: true },
    requestedBy: "ai-agent",
  });
  console.log(r2);

  // 🚫 Esto también debe ser bloqueado
  const r3 = await executor.execute({
    action: "delete_pod" as any,
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { pod: "payments-svc-1" },
    requestedBy: "ai-agent",
  });
  console.log(r3);
}

run();