import express, { Request, Response } from "express";
import { AlertNormalizer } from "./AlertNormalizer";
import { AlertSource, IncomingAlert } from "./types";

export class AlertReceiver {
  private app = express();
  private normalizer = new AlertNormalizer();
  private alerts: IncomingAlert[] = [];
  private onAlertCallback?: (alert: IncomingAlert) => void | Promise<void>;

  public constructor(private port: number = 3000) {
    this.app.use(express.json());
    this.setupRoutes();
  }

  public onAlert(callback: (alert: IncomingAlert) => void | Promise<void>): void {
    this.onAlertCallback = callback;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`\n🛡️  BastionGuard escuchando en puerto ${this.port}`);
      console.log(`   Health:     GET  http://localhost:${this.port}/health`);
      console.log(`   Prometheus: POST http://localhost:${this.port}/webhook/prometheus`);
      console.log(`   Grafana:    POST http://localhost:${this.port}/webhook/grafana`);
      console.log(`   CloudWatch: POST http://localhost:${this.port}/webhook/cloudwatch`);
      console.log(`   Custom:     POST http://localhost:${this.port}/webhook/custom\n`);
    });
  }

  public getAlerts(): IncomingAlert[] {
    return this.alerts;
  }

  private setupRoutes(): void {
    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", alerts_received: this.alerts.length });
    });

    this.app.post("/webhook/:source", (req: Request, res: Response) => {
      const source = req.params.source as AlertSource;
      const payload = req.body as Record<string, unknown>;

      console.log(`\n[ALERT] Recibido desde: ${source}`);

      try {
        const alert = this.normalizer.normalize(source, payload);
        this.alerts.push(alert);

        console.log(`[ALERT] Normalizado:`, {
          id: alert.id,
          service: alert.service,
          severity: alert.severity,
          message: alert.message,
        });

        if (this.onAlertCallback) {
          console.log(`[ALERT] Disparando pipeline...`);
          Promise.resolve(this.onAlertCallback(alert)).catch((err) => {
            console.error(`[ALERT] Error en pipeline:`, err);
          });
        } else {
          console.warn(`[ALERT] No hay callback registrado`);
        }

        res.status(200).json({ received: true, alertId: alert.id });
      } catch (err) {
        console.error(`[ALERT] Error normalizando:`, err);
        res.status(400).json({ received: false, error: String(err) });
      }
    });
  }
}
