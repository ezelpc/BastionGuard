import { AIDecision, AIDecisionRequest } from "./types";
import { ActionName, Provider } from "../action-executor/types";
import { DiagnosticReport } from "../diagnostic-engine/types";

const MAX_ATTEMPTS = 3;
const MIN_CONFIDENCE_TO_ACT = 0.6;

export class AIDecisionAgent {
  public async decide(request: AIDecisionRequest): Promise<AIDecision> {
    const USE_MOCK = process.env.AI_MOCK === "true";
    const { report, attemptNumber } = request;

    console.log(
      `\n[AI] Analizando: ${report.service.name} (intento ${attemptNumber}/${MAX_ATTEMPTS})`
    );

    if (attemptNumber >= MAX_ATTEMPTS) {
      return this.escalate(`Máximo de intentos alcanzado`, 0);
    }

    if (USE_MOCK) {
      return this.mockDecision(report);
    }

    return this.callClaude(report, attemptNumber);
  }

  private mockDecision(report: DiagnosticReport): AIDecision {
    console.log(`[AI] Modo mock activo`);

    if (report.service.recentDeploy && report.confidence >= MIN_CONFIDENCE_TO_ACT) {
      return {
        shouldAct: true,
        actionName: "disable_feature_flag",
        provider: "kubernetes",
        params: { service: report.service.name },
        reasoning: "[MOCK] Deploy reciente — desactivando feature flag como primer paso",
        confidence: report.confidence,
        escalate: false,
      };
    }

    if (report.service.replicas.ready < report.service.replicas.desired) {
      return {
        shouldAct: true,
        actionName: "scale_replicas",
        provider: "kubernetes",
        params: {
          service: report.service.name,
          replicas: report.service.replicas.desired,
        },
        reasoning: "[MOCK] Réplicas degradadas — escalando al número deseado",
        confidence: report.confidence,
        escalate: false,
      };
    }

    return this.escalate("[MOCK] No hay suficiente contexto para actuar", 0.4);
  }

  private async callClaude(report: DiagnosticReport, attemptNumber: number): Promise<AIDecision> {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: this.buildPrompt(report, attemptNumber) }],
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return this.parseDecision(text, report.confidence);
    } catch (err) {
      console.error(`[AI] Error consultando Claude:`, err);
      return this.escalate("Error al consultar el agente de IA", 0);
    }
  }

  private buildPrompt(report: DiagnosticReport, attemptNumber: number): string {
    return `Eres un agente DevSecOps de auto-remediation. Analiza este incidente y decide qué acción tomar.

INCIDENTE:
- Servicio: ${report.service.name}
- Severidad: ${report.alert.severity}
- Mensaje: ${report.alert.message}
- Réplicas: ${report.service.replicas.ready}/${report.service.replicas.desired} listas
- Deploy reciente: ${report.service.recentDeploy ? "Sí" : "No"}
- Causas posibles: ${report.possibleCauses.join(", ")}
- Confianza: ${(report.confidence * 100).toFixed(0)}%
- Intento: ${attemptNumber}

ACCIONES DISPONIBLES:
- restart_service, scale_replicas, disable_feature_flag, activate_fallback, notify_slack

REGLAS:
1. NUNCA sugieras eliminar, borrar o destruir nada
2. Si confianza < 60% escala a humano
3. Deploy reciente + problemas = disable_feature_flag primero

Responde SOLO en JSON:
{
  "shouldAct": true,
  "actionName": "nombre_accion",
  "provider": "kubernetes",
  "params": { "service": "${report.service.name}" },
  "reasoning": "explicación",
  "confidence": 0.85,
  "escalate": false,
  "escalationReason": null
}`;
  }

  private parseDecision(text: string, diagnosticConfidence: number): AIDecision {
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const confidence = parsed.confidence ?? diagnosticConfidence;

      if (confidence < MIN_CONFIDENCE_TO_ACT && !parsed.escalate) {
        return this.escalate(
          `Confianza insuficiente: ${(confidence * 100).toFixed(0)}%`,
          confidence
        );
      }

      return {
        shouldAct: parsed.shouldAct ?? false,
        actionName: parsed.actionName as ActionName,
        provider: (parsed.provider ?? "kubernetes") as Provider,
        params: parsed.params ?? {},
        reasoning: parsed.reasoning ?? "Sin razonamiento",
        confidence,
        escalate: parsed.escalate ?? false,
        escalationReason: parsed.escalationReason ?? undefined,
      };
    } catch {
      return this.escalate("No se pudo parsear la respuesta de la IA", 0);
    }
  }

  private escalate(reason: string, confidence: number): AIDecision {
    console.warn(`[AI] Escalando a humano: ${reason}`);
    return {
      shouldAct: false,
      reasoning: reason,
      confidence,
      escalate: true,
      escalationReason: reason,
    };
  }
}
