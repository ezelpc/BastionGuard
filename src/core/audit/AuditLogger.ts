import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { AuditEntry, AuditEntryType } from "./types";

const LOG_PATH = path.resolve(process.cwd(), "data", "audit-log.jsonl");
const MAX_MEMORY = 500;

export class AuditLogger {
  private static instance: AuditLogger;
  private cache: AuditEntry[] = [];
  private pool?: Pool;

  private constructor() {
    if (process.env.ENABLE_AUDIT_LOG_PERSISTENCE === "true") {
      this.pool = new Pool({
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER || "bastionguard",
        password: process.env.DB_PASSWORD || "dev-password",
        database: process.env.DB_NAME || "bastionguard_dev",
      });
      this.initDb().catch(console.error);
    } else {
      // Crear directorio data/ si no existe
      const dir = path.dirname(LOG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Cargar entradas existentes en memoria (solo modo archivo)
      if (fs.existsSync(LOG_PATH)) {
        const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
        this.cache = lines
          .map((line) => {
            try {
              return JSON.parse(line) as AuditEntry;
            } catch {
              return null;
            }
          })
          .filter((e): e is AuditEntry => e !== null)
          .slice(-MAX_MEMORY);
      }
    }

    console.log(
      `[AUDIT] Logger iniciado — Modo persistencia DB: ${
        this.pool ? "ACTIVADO" : "DESACTIVADO (Local FS)"
      }`
    );
  }

  private async initDb() {
    try {
      await this.pool?.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY,
          timestamp TIMESTAMP NOT NULL,
          type VARCHAR(50) NOT NULL,
          tenant_id VARCHAR(100) NOT NULL,
          service VARCHAR(100) NOT NULL,
          label VARCHAR(255) NOT NULL,
          success BOOLEAN NOT NULL,
          confidence REAL,
          dry_run BOOLEAN
        );
      `);

      await this.pool?.query(`
        CREATE TABLE IF NOT EXISTS oncall_schedules (
          id UUID PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          engineer_name VARCHAR(255) NOT NULL,
          phone_number VARCHAR(50) NOT NULL,
          shift_start TIMESTAMP NOT NULL,
          shift_end TIMESTAMP NOT NULL,
          is_active BOOLEAN DEFAULT true
        );
      `);
      console.log(`[AUDIT] Tablas de PostgreSQL verificadas/creadas.`);

      // Load recent logs from DB into cache
      const res = await this.pool?.query(
        `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1`,
        [MAX_MEMORY]
      );
      if (res && res.rows) {
        this.cache = res.rows
          .map((r) => ({
            id: r.id,
            timestamp: new Date(r.timestamp).toISOString(),
            type: r.type as AuditEntryType,
            tenantId: r.tenant_id,
            service: r.service,
            label: r.label,
            success: r.success,
            confidence: r.confidence,
            details: r.details,
            dryRun: r.dry_run,
          }))
          .reverse();
      }
    } catch (err) {
      console.error("[AUDIT] Error inicializando DB:", err);
    }
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  public getPool(): Pool | undefined {
    return this.pool;
  }

  public append(
    type: AuditEntryType,
    opts: {
      tenantId: string;
      service: string;
      label: string;
      success: boolean;
      confidence?: number;
      details?: string;
      dryRun?: boolean;
    }
  ): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      ...opts,
    };

    if (this.pool) {
      // Guardar en DB asincrónicamente
      this.pool
        .query(
          `INSERT INTO audit_logs (id, timestamp, type, tenant_id, service, label, success, confidence, details, dry_run) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            entry.id,
            entry.timestamp,
            entry.type,
            opts.tenantId,
            opts.service,
            opts.label,
            opts.success,
            opts.confidence ?? null,
            opts.details ?? null,
            opts.dryRun ?? null,
          ]
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => console.error("[AUDIT] Error persistiendo en DB:", err));
    } else {
      // Guardar en archivo local
      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
    }

    // Mantener cache en memoria
    this.cache.push(entry);
    if (this.cache.length > MAX_MEMORY) {
      this.cache.shift();
    }

    return entry;
  }

  public readAll(): AuditEntry[] {
    return [...this.cache];
  }

  public readLast(n: number): AuditEntry[] {
    return this.cache.slice(-n);
  }

  public summary(): {
    total: number;
    resolved: number;
    escalated: number;
    blocked: number;
    avgConfidence: number | null;
  } {
    const decisions = this.cache.filter((e) => e.confidence !== undefined && e.confidence !== null);
    const avgConf =
      decisions.length > 0
        ? decisions.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / decisions.length
        : null;

    return {
      total: this.cache.length,
      resolved: this.cache.filter((e) => e.type === "action" && e.success).length,
      escalated: this.cache.filter((e) => e.type === "escalation").length,
      blocked: this.cache.filter((e) => e.type === "blocked").length,
      avgConfidence: avgConf,
    };
  }
}
