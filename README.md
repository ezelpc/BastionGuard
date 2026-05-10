# 🛡️ BastionGuard

> **La plataforma definitiva de auto-remediación impulsada por Inteligencia Artificial para DevSecOps.**

[![CI](https://github.com/tu-usuario/bastionguard/actions/workflows/ci.yml/badge.svg)](https://github.com/tu-usuario/bastionguard/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)

**BastionGuard** actúa como un Ingeniero de Confiabilidad del Sitio (SRE) virtual que trabaja 24/7. Detecta incidentes en tiempo real, diagnostica la raíz del problema mediante telemetría, y utiliza IA avanzada para tomar decisiones y ejecutar acciones de auto-remediación en tu infraestructura — *sin despertar a tu equipo a las 3 AM*.

Si la IA no tiene suficiente confianza para resolver el problema, BastionGuard escala inteligentemente la alerta al equipo responsable con un reporte detallado del diagnóstico.

---

## ✨ Características Principales

* 🧠 **Resolución Inteligente:** Utiliza LLMs (como Claude) para analizar métricas, logs y alertas, y decidir la mejor acción correctiva.
* 🔌 **Integraciones Universales:** Compatible nativamente con **Prometheus, Grafana y AWS CloudWatch**.
* 🏢 **Arquitectura Multi-Tenant:** Diseñado para empresas B2B. Gestiona múltiples clientes o entornos con configuraciones, umbrales de confianza y permisos independientes.
* 🛡️ **Ejecución Segura:** Control estricto de qué acciones puede tomar la IA por cada tenant. Soporta modo *Dry-Run* para pruebas sin impacto real.
* 📊 **Dashboard en Tiempo Real:** Interfaz web interactiva (vía WebSocket) para monitorear incidentes, diagnósticos y acciones de remediación en vivo.
* 📜 **Auditoría Inmutable:** Registro completo y detallado de cada alerta, decisión de la IA y acción ejecutada para fines de cumplimiento y auditoría.

---

## ⚙️ ¿Cómo Funciona?

1. **Recepción (Alert Receiver):** Un incidente es disparado por tu sistema de monitoreo (ej. uso crítico de memoria o latencia alta) y es enviado vía Webhook a BastionGuard.
2. **Diagnóstico (Diagnostic Engine):** El sistema recopila contexto adicional, analiza réplicas afectadas, métricas y despliegues recientes.
3. **Decisión (AI Agent):** El agente de IA evalúa el reporte de diagnóstico y determina si puede resolver el problema de manera segura.
4. **Ejecución o Escalado (Action Executor / Escalation):**
   * Si la confianza de la IA supera el umbral del tenant, ejecuta la solución (ej. escalar pods, reiniciar servicio, bloquear IP).
   * Si la confianza es baja o la acción no está permitida, se **escala** al equipo de guardia.
5. **Auditoría (Audit Logger):** Todo el proceso queda registrado.

---

## 🚀 Instalación y Uso

### Prerrequisitos

* [Node.js](https://nodejs.org/) (v18 o superior)
* [npm](https://www.npmjs.com/) o [Yarn](https://yarnpkg.com/)
* Una clave de API de tu proveedor de IA (ej. Anthropic/Claude u OpenAI).

### Configuración Rápida

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/bastionguard.git
   cd bastionguard
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Copia el archivo de ejemplo y configura tus credenciales:
   ```bash
   cp .env.example .env
   ```
   *Asegúrate de agregar tus claves de API para la IA y servicios.*

4. **Configurar Tenants:**
   Ajusta las políticas de auto-remediación, permisos y confianza de la IA en `src/config/tenants.yml`.

### Ejecución

Para iniciar el servidor en modo desarrollo:

```bash
npm run dev
```

Para probar un escenario de simulación end-to-end interactivo:

```bash
npm run demo
```

Una vez iniciado, accede al **Dashboard en Tiempo Real** visitando:
`http://localhost:3000`

---

## 📖 Casos de Uso (Casos de Éxito)

* **E-commerce:** Ante un pico de tráfico que dispara la CPU de la base de datos, BastionGuard diagnostica la carga y automáticamente escala horizontalmente los recursos sin interrupción de servicio.
* **Fintech:** Si se detecta una alerta de seguridad por peticiones sospechosas (Rate Limit), la IA bloquea temporalmente las IPs ofensivas en el WAF y notifica al equipo de ciberseguridad con el contexto completo.
* **SaaS B2B:** Cada cliente tiene su propio entorno (Tenant). Algunos clientes permiten remediación totalmente autónoma para optimizar tiempos de respuesta, mientras que otros requieren que BastionGuard solo envíe diagnósticos detallados para su aprobación (Escalamiento Manual).

---

## 🤝 Contribuir

¡Nos encanta la comunidad open-source! Si deseas contribuir a BastionGuard:

1. Haz un fork del proyecto.
2. Crea una rama para tu feature (`git checkout -b feature/NuevaCaracteristica`).
3. Haz commit de tus cambios (`git commit -m 'Añade NuevaCaracteristica'`).
4. Haz push a la rama (`git push origin feature/NuevaCaracteristica`).
5. Abre un Pull Request.

Asegúrate de que todo el código cumpla con los estándares de linting y pase las pruebas:
```bash
npm run lint
npm run test
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---
*Construido para hacer que DevSecOps sea más inteligente, rápido y seguro.*