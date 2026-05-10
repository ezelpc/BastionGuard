import express, { Application } from "express";
import * as http from "http";
import { AlertReceiver } from "../AlertReceiver";
import { IncomingAlert } from "../types";

// Fire an HTTP request against the Express app on a random port.
// Using a real server on localhost avoids mock req/res fragility.
function startServer(app: Application): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
    server.on("error", reject);
  });
}

async function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(data) as Record<string, unknown>,
          });
        } catch {
          reject(new Error(`Could not parse response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("AlertReceiver", () => {
  describe("constructor / getAlerts / onAlert", () => {
    it("debe inicializarse con app existente y retornar 0 alertas", () => {
      const app = express();
      app.use(express.json());
      const receiver = new AlertReceiver(3000, app);
      expect(receiver.getAlerts()).toEqual([]);
    });

    it("debe inicializarse sin app (crea la propia)", () => {
      const receiver = new AlertReceiver(3099);
      expect(receiver).toBeDefined();
      expect(receiver.getAlerts()).toEqual([]);
    });

    it("debe registrar callback de onAlert sin invocarlo", () => {
      const app = express();
      app.use(express.json());
      const receiver = new AlertReceiver(3000, app);
      const cb = jest.fn();
      receiver.onAlert(cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("start()", () => {
    it("debe resolver inmediatamente si app ya tiene puerto configurado", async () => {
      const app = express();
      app.use(express.json());
      app.set("port", 3000); // simulate WebServer already running
      const receiver = new AlertReceiver(3000, app);
      await expect(receiver.start()).resolves.toBeUndefined();
    });
  });

  describe("HTTP routes", () => {
    let receiver: AlertReceiver;
    let app: Application;
    let port: number;
    let close: () => Promise<void>;

    beforeEach(async () => {
      app = express();
      app.use(express.json());
      receiver = new AlertReceiver(0, app);
      ({ port, close } = await startServer(app));
    });

    afterEach(async () => {
      await close();
    });

    // ── /health ────────────────────────────────────────────────────────────
    it("GET /health debe retornar status ok con 0 alertas", async () => {
      const res = await httpRequest(port, "GET", "/health");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ok", alerts_received: 0 });
    });

    // ── /webhook — éxito ───────────────────────────────────────────────────
    it("POST /webhook/prometheus debe normalizar y almacenar alerta", async () => {
      const payload = {
        alerts: [
          {
            status: "firing",
            labels: { severity: "critical", service: "api-gateway" },
            annotations: { summary: "High error rate" },
          },
        ],
      };

      const res = await httpRequest(port, "POST", "/webhook/prometheus", payload);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ received: true });
      expect(typeof res.body.alertId).toBe("string");

      const alerts = receiver.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].source).toBe("prometheus");
      expect(alerts[0].severity).toBe("critical");
    });

    it("POST /webhook/grafana debe normalizar y almacenar alerta", async () => {
      const payload = {
        status: "alerting",
        title: "Memory Alert",
        labels: { service: "database" },
        message: "Memory usage is critical",
      };

      const res = await httpRequest(port, "POST", "/webhook/grafana", payload);
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(receiver.getAlerts()[0].source).toBe("grafana");
    });

    it("debe invocar callback onAlert al recibir alerta válida", async () => {
      const received: IncomingAlert[] = [];
      receiver.onAlert((a) => { received.push(a); });

      await httpRequest(port, "POST", "/webhook/prometheus", {
        alerts: [
          {
            status: "firing",
            labels: { service: "test-svc", severity: "high" },
            annotations: { summary: "Test" },
          },
        ],
      });

      // Allow async callback to complete
      await new Promise((r) => setTimeout(r, 50));
      expect(received).toHaveLength(1);
      expect(received[0].source).toBe("prometheus");
    });

    it("debe acumular múltiples alertas de distintas fuentes", async () => {
      await httpRequest(port, "POST", "/webhook/prometheus", {
        alerts: [{ status: "firing", labels: { service: "s1" }, annotations: { summary: "x" } }],
      });
      await httpRequest(port, "POST", "/webhook/grafana", {
        status: "alerting",
        title: "T",
        labels: { service: "s2" },
        message: "m",
      });

      expect(receiver.getAlerts()).toHaveLength(2);
    });

    it("GET /health debe reflejar conteo actualizado tras alertas", async () => {
      await httpRequest(port, "POST", "/webhook/prometheus", {
        alerts: [{ status: "firing", labels: { service: "s" }, annotations: { summary: "ok" } }],
      });

      const res = await httpRequest(port, "GET", "/health");
      expect(res.body).toMatchObject({ status: "ok", alerts_received: 1 });
    });

    // ── /webhook — error ───────────────────────────────────────────────────
    it("POST /webhook con fuente desconocida debe retornar 400", async () => {
      const res = await httpRequest(port, "POST", "/webhook/unknown-xyz", {});
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ received: false });
    });
  });
});
