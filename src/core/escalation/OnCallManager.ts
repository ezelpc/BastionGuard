import { randomUUID } from "crypto";
import { AuditLogger } from "../audit/AuditLogger";

export interface OnCallShift {
  id: string;
  tenantId: string;
  engineerName: string;
  phoneNumber: string;
  shiftStart: string;
  shiftEnd: string;
  isActive: boolean;
}

export class OnCallManager {
  /**
   * Retrieves the currently active on-call engineer for a tenant.
   * Checks the PostgreSQL database if available.
   */
  public async getCurrentOnCall(tenantId: string): Promise<OnCallShift | null> {
    const pool = AuditLogger.getInstance().getPool();
    
    if (!pool) {
      // Fallback for local development without DB
      return {
        id: "mock-id",
        tenantId,
        engineerName: "Ingeniero de Guardia (Local)",
        phoneNumber: "+1234567890",
        shiftStart: new Date().toISOString(),
        shiftEnd: new Date(Date.now() + 86400000).toISOString(),
        isActive: true,
      };
    }

    try {
      const res = await pool.query(
        `SELECT * FROM oncall_schedules 
         WHERE tenant_id = $1 
         AND is_active = true 
         AND shift_start <= NOW() 
         AND shift_end >= NOW()
         ORDER BY shift_start DESC LIMIT 1`,
        [tenantId]
      );

      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          tenantId: r.tenant_id,
          engineerName: r.engineer_name,
          phoneNumber: r.phone_number,
          shiftStart: new Date(r.shift_start).toISOString(),
          shiftEnd: new Date(r.shift_end).toISOString(),
          isActive: r.is_active,
        };
      }
      return null;
    } catch (err) {
      console.error("[ONCALL] Error obteniendo guardia actual:", err);
      return null;
    }
  }

  /**
   * Adds a new shift or substitution to the calendar.
   */
  public async addShift(shift: Omit<OnCallShift, "id">): Promise<OnCallShift | null> {
    const pool = AuditLogger.getInstance().getPool();
    if (!pool) {
      console.warn("[ONCALL] No se puede guardar el turno sin base de datos activa.");
      return null;
    }

    const newId = randomUUID();
    try {
      await pool.query(
        `INSERT INTO oncall_schedules (id, tenant_id, engineer_name, phone_number, shift_start, shift_end, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId, shift.tenantId, shift.engineerName, shift.phoneNumber, shift.shiftStart, shift.shiftEnd, shift.isActive]
      );

      return { id: newId, ...shift };
    } catch (err) {
      console.error("[ONCALL] Error guardando nuevo turno:", err);
      return null;
    }
  }

  /**
   * Gets all upcoming and active shifts for a tenant
   */
  public async getSchedule(tenantId: string): Promise<OnCallShift[]> {
    const pool = AuditLogger.getInstance().getPool();
    if (!pool) return [];

    try {
      const res = await pool.query(
        `SELECT * FROM oncall_schedules 
         WHERE tenant_id = $1 
         ORDER BY shift_start ASC LIMIT 50`,
        [tenantId]
      );

      return res.rows.map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        engineerName: r.engineer_name,
        phoneNumber: r.phone_number,
        shiftStart: new Date(r.shift_start).toISOString(),
        shiftEnd: new Date(r.shift_end).toISOString(),
        isActive: r.is_active,
      }));
    } catch (err) {
      console.error("[ONCALL] Error obteniendo calendario:", err);
      return [];
    }
  }
}
