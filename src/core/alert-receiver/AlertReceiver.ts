import express, { Application, Request, Response } from "express";
import { AlertNormalizer } from "./AlertNormalizer";
import { AlertSource, IncomingAlert } from "./types";
import { TenantConfigManager } from "../../config/TenantConfigManager";

export class AlertReceiver {
  private app: Application;
  private normalizer = new AlertNormalizer();
  private alerts: IncomingAlert[] = [];
  private onAlertCallback?: (alert: IncomingAlert) => void | Promise<void>;

  public constructor(
    private port: number = 3000,
    existingApp?: Application,
    private tenantConfig?: TenantConfigManager
  ) {
    this.app = existingApp ?? express();
    if (!existingApp) {
      this.app.use(express.json());
    }
    this.setupRoutes();
  }

  public onAlert(callback: (alert: IncomingAlert) => void | Promise<void>): void {
    this.onAlertCallback = callback;
  }

  public start(): Promise<void> {
    if (this.app.get("port")) {
      // Ya está corriendo desde WebServer
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`\n🛡️  BastionGuard escuchando en puerto ${this.port}\n`);
        resolve();
      });
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
      let authorizedTenantId: string | undefined;

      if (this.tenantConfig && process.env.NODE_ENV === "production") {
        const apiKey = req.headers["x-api-key"] as string;
        const tenant = this.tenantConfig.getTenantByApiKey(apiKey);
        if (!tenant) {
          res.status(401).json({ error: "Unauthorized: Invalid API Key" });
          return;
        }
        authorizedTenantId = tenant.id;
      }

      const source = req.params.source as AlertSource;
      const payload = req.body as Record<string, unknown>;

      console.log(`\n[ALERT] Recibido desde: ${source}`);

      try {
        const alert = this.normalizer.normalize(source, payload);
        if (authorizedTenantId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (alert as any).tenantId = authorizedTenantId;
        }
        this.alerts.push(alert);

        console.log(`[ALERT] Normalizado:`, {
          id: alert.id,
          service: alert.service,
          severity: alert.severity,
          message: alert.message,
        });

        if (this.onAlertCallback) {
          Promise.resolve(this.onAlertCallback(alert)).catch((err) => {
            console.error(`[ALERT] Error en pipeline:`, err);
          });
        }

        res.status(200).json({ received: true, alertId: alert.id });
      } catch (err) {
        console.error(`[ALERT] Error normalizando:`, err);
        res.status(400).json({ received: false, error: String(err) });
      }
    });
  }
}
