import { ActionExecutor } from "./core/action-executor/ActionExecutor";

const executor = new ActionExecutor(true); // dryRun activado

async function run() {
  console.log("\n=== Test 1: Acción válida ===");
  const r1 = await executor.execute({
    actionName: "restart_service",
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { service: "api-gateway", namespace: "production" },
    requestedBy: "ai-agent",
  });
  console.log(r1);

  console.log("\n=== Test 2: Bloqueado por keyword prohibido ===");
  const r2 = await executor.execute({
    actionName: "restart_service",
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { service: "api-gateway", force_delete: true },
    requestedBy: "ai-agent",
  });
  console.log(r2);

  console.log("\n=== Test 3: Bloqueado por acción no en allowlist ===");
  const r3 = await executor.execute({
    actionName: "delete_pod" as any,
    provider: "kubernetes",
    tenantId: "empresa-a",
    params: { pod: "payments-svc-1" },
    requestedBy: "ai-agent",
  });
  console.log(r3);

  console.log("\n=== Audit Log completo ===");
  console.log(executor.getAuditLog());
}

run();
