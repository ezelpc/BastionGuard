import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import path from "path";
import jwt from "jsonwebtoken";
import { IncomingAlert } from "../core/alert-receiver/types";
import { DiagnosticReport } from "../core/diagnostic-engine/types";
import { AIDecision } from "../core/ai-agent/types";
import { PostMortemGenerator } from "../core/ai-agent/PostMortemGenerator";
import { ActionResult } from "../core/action-executor/types";
import { AuditLogger } from "../core/audit/AuditLogger";
import { TenantConfig } from "../config/types";
import { OnCallManager } from "../core/escalation/OnCallManager";
import { AuthManager } from "../core/auth/AuthManager";

export interface PipelineEvent {
  id: string;
  timestamp: string;
  type: "alert" | "diagnostic" | "decision" | "action" | "escalation";
  tenantId: string;
  data: unknown;
}

export class WebServer {
  private app = express();
  private httpServer = createServer(this.app);
  private io = new SocketServer(this.httpServer, {
    cors: { origin: "*" },
  });
  private events: PipelineEvent[] = [];
  private auditLogger = AuditLogger.getInstance();
  private tenants: TenantConfig[] = [];
  private demoTrigger?: () => Promise<void>;

  public constructor(private port: number = 3000) {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(process.cwd(), "src/public")));
  }

  private setupRoutes(): void {
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        events: this.events.length,
        ...this.auditLogger.summary(),
      });
    });

    const authMiddleware = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // Requerimos token siempre para validar el nuevo UI
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
        return;
      }

      const token = authHeader.split(" ")[1];
      try {
        jwt.verify(token, process.env.JWT_SECRET || "dev-secret-key-change-in-production");
        next();
      } catch (err) {
        res.status(403).json({ error: "Forbidden: Invalid token" });
      }
    };

    this.app.get("/api/events", authMiddleware, (_req, res) => {
      res.json(this.events.slice(-100));
    });

    // Tenants cargados — para el dashboard
    this.app.get("/api/tenants", authMiddleware, (_req, res) => {
      res.json(
        this.tenants.map((t) => ({
          id: t.id,
          name: t.name,
          enabled: t.enabled,
          providers: t.providers.filter((p) => p.enabled).map((p) => p.name),
          minConfidence: t.aiThreshold.minConfidence,
        }))
      );
    });

    // Audit log persistido
    this.app.get("/api/audit", authMiddleware, (_req, res) => {
      res.json(this.auditLogger.readLast(100));
    });

    // Resumen estadístico
    const authManager = new AuthManager();

    this.app.post("/api/login", async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "Email y contraseña requeridos" });
        return;
      }
      
      const token = await authManager.authenticate(email, password);
      if (token) {
        res.json({ token });
      } else {
        res.status(401).json({ error: "Credenciales inválidas" });
      }
    });

    this.app.get("/api/summary", authMiddleware, (_req, res) => {
      res.json(this.auditLogger.summary());
    });

    const postMortemGen = new PostMortemGenerator();
    this.app.post(
      "/api/tenants/:tenantId/services/:serviceName/post-mortem",
      authMiddleware,
      async (req, res) => {
        const tenantId = req.params.tenantId as string;
        const serviceName = req.params.serviceName as string;
        const rca = await postMortemGen.generate(serviceName, tenantId);
        res.json({ markdown: rca });
      }
    );

    const onCallManager = new OnCallManager();
    this.app.get("/api/tenants/:tenantId/oncall", authMiddleware, async (req, res) => {
      const tenantId = req.params.tenantId as string;
      const schedule = await onCallManager.getSchedule(tenantId);
      res.json(schedule);
    });

    this.app.post("/api/tenants/:tenantId/oncall", authMiddleware, async (req, res) => {
      const tenantId = req.params.tenantId as string;
      const { engineerName, phoneNumber, shiftStart, shiftEnd, isActive } = req.body;
      const shift = await onCallManager.addShift({
        tenantId,
        engineerName,
        phoneNumber,
        shiftStart,
        shiftEnd,
        isActive: isActive !== false
      });
      if (shift) res.json(shift);
      else res.status(500).json({ error: "Failed to add shift" });
    });

    // Trigger de demo — solo en modo no-producción
    this.app.all("/api/demo/trigger", async (_req, res) => {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({ error: "No disponible en producción" });
        return;
      }
      if (!this.demoTrigger) {
        res.status(503).json({ error: "Demo trigger no registrado" });
        return;
      }
      res.json({ ok: true, message: "Disparando alerta de demo..." });
      // Ejecutar asíncronamente para no bloquear la respuesta HTTP
      this.demoTrigger().catch((err) => console.error("[DEMO]", err));
    });
  }

  private setupSocketIO(): void {
    const authManager = new AuthManager();

    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }
      const user = authManager.verifyToken(token);
      if (!user) {
        return next(new Error("Authentication error: Invalid token"));
      }
      next();
    });

    this.io.on("connection", (socket) => {
      console.log(`[UI] Cliente conectado (Autenticado): ${socket.id}`);

      // Enviar historial al conectarse
      socket.emit("history", this.events.slice(-50));

      socket.on("disconnect", () => {
        console.log(`[UI] Cliente desconectado: ${socket.id}`);
      });
    });
  }

  public emitAlert(tenantId: string, alert: IncomingAlert): void {
    const event: PipelineEvent = {
      id: alert.id,
      timestamp: alert.receivedAt,
      type: "alert",
      tenantId,
      data: alert,
    };
    this.events.push(event);
    this.io.emit("pipeline_event", event);
  }

  public emitDiagnostic(tenantId: string, report: DiagnosticReport): void {
    const event: PipelineEvent = {
      id: `diag-${Date.now()}`,
      timestamp: report.generatedAt,
      type: "diagnostic",
      tenantId,
      data: report,
    };
    this.events.push(event);
    this.io.emit("pipeline_event", event);
  }

  public emitDecision(tenantId: string, decision: AIDecision): void {
    const event: PipelineEvent = {
      id: `dec-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "decision",
      tenantId,
      data: decision,
    };
    this.events.push(event);
    this.io.emit("pipeline_event", event);
  }

  public emitAction(tenantId: string, result: ActionResult): void {
    const event: PipelineEvent = {
      id: `act-${Date.now()}`,
      timestamp: result.executedAt,
      type: "action",
      tenantId,
      data: result,
    };
    this.events.push(event);
    this.io.emit("pipeline_event", event);
  }

  public emitEscalation(tenantId: string, reason: string, service: string): void {
    const event: PipelineEvent = {
      id: `esc-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "escalation",
      tenantId,
      data: { reason, service },
    };
    this.events.push(event);
    this.io.emit("pipeline_event", event);
  }

  /** Registrar función de disparo de demo desde test-executor */
  public registerDemoTrigger(fn: () => Promise<void>): void {
    this.demoTrigger = fn;
  }

  /** Registrar tenants cargados para exponerlos via API */
  public registerTenants(tenants: TenantConfig[]): void {
    this.tenants = tenants;
  }

  public getExpressApp(): express.Application {
    return this.app;
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`\n🛡️  BastionGuard corriendo en http://localhost:${this.port}`);
        console.log(`   Dashboard:  http://localhost:${this.port}`);
        console.log(`   Health:     http://localhost:${this.port}/health`);
        console.log(`   Webhooks:   http://localhost:${this.port}/webhook/:source\n`);
        resolve();
      });

      this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`❌ Puerto ${this.port} ya está en uso`);
          process.exit(1);
        }
        throw err;
      });
    });
  }
}
