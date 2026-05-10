import { AuditLogger } from "../audit/AuditLogger";

export class PostMortemGenerator {
  public async generate(serviceName: string, tenantId: string): Promise<string> {
    const audit = AuditLogger.getInstance();
    const logs = audit.readLast(30).filter(l => l.service === serviceName && l.tenantId === tenantId);

    if (logs.length === 0) {
      return "No se encontraron logs recientes para generar un Post-Mortem.";
    }

    const USE_MOCK = process.env.AI_MOCK === "true";
    if (USE_MOCK) {
      return this.mockRCA(serviceName);
    }

    return this.callClaude(serviceName, logs);
  }

  private mockRCA(serviceName: string): string {
    return `# Post-Mortem: ${serviceName}

**Fecha de Resolución:** ${new Date().toISOString()}

## 1. Resumen Ejecutivo
BastionGuard detectó un incidente crítico en el servicio \`${serviceName}\`. El agente de Inteligencia Artificial intervino de forma autónoma, diagnosticando una falta de recursos debido a un pico de tráfico, y ejecutó una acción de remediación inmediata (scale_replicas) mitigando el impacto sin requerir intervención humana.

## 2. Línea de Tiempo
* **T+00:00:** Alerta recibida vía webhook.
* **T+00:02:** Diagnóstico inicial completado (Confianza 85%).
* **T+00:05:** La IA decidió escalar réplicas y ejecutó la acción en el clúster.
* **T+00:07:** Servicio restablecido y operando normalmente.

## 3. Acciones Tomadas por BastionGuard (IA)
- Acción: \`scale_replicas\`
- Confianza: 85%
- El agente decidió evitar escalar a humanos al tener suficiente confianza en el diagnóstico basado en métricas de CPU y memoria.

## 4. Recomendaciones a Futuro
- Revisar la configuración de Horizontal Pod Autoscaler (HPA) para que sea más agresiva ante incrementos repentinos de tráfico.
- Añadir caché en la capa de API Gateway.`;
  }

  private async callClaude(serviceName: string, logs: unknown[]): Promise<string> {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      const prompt = `Eres un Site Reliability Engineer (SRE) experto. A continuación tienes los logs de auditoría recientes de BastionGuard (nuestra IA de auto-remediación) para el servicio '${serviceName}'. 
Tu tarea es generar un documento de Post-Mortem (Root Cause Analysis) profesional en Markdown.

LOGS DEL INCIDENTE:
${JSON.stringify(logs, null, 2)}

ESTRUCTURA REQUERIDA DEL DOCUMENTO:
# Post-Mortem: [Nombre del Servicio]
**Fecha de Resolución:** [Fecha de hoy]

## 1. Resumen Ejecutivo
(Un párrafo breve sobre qué pasó, el impacto y cómo lo resolvió BastionGuard)

## 2. Línea de Tiempo (Timeline)
(Puntos de bala con los eventos principales de la IA extraídos de los logs, incluyendo diagnósticos, fallos y éxitos)

## 3. Acciones Tomadas por BastionGuard (IA)
(Detalle de qué decisiones tomó el agente, su nivel de confianza, y si fue bloqueado por políticas o fue exitoso)

## 4. Recomendaciones a Futuro
(Sugerencias técnicas para el equipo de ingeniería basadas en los logs, para evitar que esto vuelva a pasar)

Responde ÚNICAMENTE con el documento Markdown generado. No incluyas preámbulos.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return text;
    } catch (err) {
      console.error("[PostMortem] Error:", err);
      return `Error generando el Post-Mortem: ${String(err)}`;
    }
  }
}
