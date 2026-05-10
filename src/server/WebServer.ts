import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import path from "path";
import { IncomingAlert } from "../core/alert-receiver/types";
import { DiagnosticReport } from "../core/diagnostic-engine/types";
import { AIDecision } from "../core/ai-agent/types";
import { ActionResult } from "../core/action-executor/types";

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
      res.json({ status: "ok", events: this.events.length });
    });

    this.app.get("/api/events", (_req, res) => {
      res.json(this.events.slice(-100));
    });
  }

  private setupSocketIO(): void {
    this.io.on("connection", (socket) => {
      console.log(`[UI] Cliente conectado: ${socket.id}`);

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
