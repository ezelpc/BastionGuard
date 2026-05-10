import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { AuditEntry, AuditEntryType } from "./types";

const LOG_PATH = path.resolve(process.cwd(), "data", "audit-log.jsonl");
const MAX_MEMORY = 500;

export class AuditLogger {
  private static instance: AuditLogger;
  private cache: AuditEntry[] = [];

  private constructor() {
    // Crear directorio data/ si no existe
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Cargar entradas existentes en memoria
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

    console.log(
      `[AUDIT] Logger iniciado — ${this.cache.length} entradas previas cargadas desde ${LOG_PATH}`
    );
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
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

    // Persistir en disco
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");

    // Mantener cache en memoria (circular buffer)
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

  /** Resumen estadístico para el dashboard */
  public summary(): {
    total: number;
    resolved: number;
    escalated: number;
    blocked: number;
    avgConfidence: number | null;
  } {
    const decisions = this.cache.filter((e) => e.confidence !== undefined);
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
