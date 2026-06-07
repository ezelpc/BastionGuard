import express, { Application, Request, Response } from "express";
import { TenantConfigManager } from "../../config/TenantConfigManager";
import { AlertNormalizer } from "./AlertNormalizer";
import { RateLimiter, createRateLimitMiddleware, getClientIdentifier } from "./RateLimiter";
import { AlertSource, IncomingAlert } from "./types";

export class AlertReceiver {
  private app: Application;
  private normalizer = new AlertNormalizer();
  private alerts: IncomingAlert[] = [];
  private onAlertCallback?: (alert: IncomingAlert) => void | Promise<void>;
  private rateLimiter: RateLimiter;

  public constructor(
    private port: number = 3000,
    existingApp?: Application,
    private tenantConfig?: TenantConfigManager
  ) {
    this.app = existingApp ?? express();
    if (!existingApp) {
      this.app.use(express.json());
    }

    // Initialize rate limiter with env variables or defaults
    const alertsPerMin = parseInt(process.env.RATE_LIMIT_ALERTS_PER_MINUTE || "100", 10);
    const alertsPerHour = parseInt(process.env.RATE_LIMIT_ALERTS_PER_HOUR || "2000", 10);
    this.rateLimiter = new RateLimiter(alertsPerMin, alertsPerHour);

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

    // Apply rate limiting middleware to webhook endpoint
    this.app.post(
      "/webhook/:source",
      createRateLimitMiddleware(this.rateLimiter, (req) => {
        // Extract tenant ID from API key or IP
        if (this.tenantConfig && process.env.NODE_ENV === "production") {
          const apiKey = req.headers["x-api-key"] as string;
          const tenant = this.tenantConfig.getTenantByApiKey(apiKey);
          if (tenant) {
            return getClientIdentifier(req, tenant.id);
          }
        }
        return getClientIdentifier(req);
      }),
      (req: Request, res: Response) => {
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
      }
    );
  }

  /**
   * Get rate limiter instance for testing or custom usage
   */
  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.rateLimiter.destroy();
  }
}
