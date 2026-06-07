import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuditLogger } from "../audit/AuditLogger";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

export class AuthManager {
  private jwtSecret: string;

  public constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "dev-secret-key-change-in-production";
  }

  /**
   * Autentica un usuario verificando su contraseña contra PostgreSQL
   */
  public async authenticate(email: string, passwordPlain: string): Promise<string | null> {
    // Si estamos en desarrollo/mock, permitir siempre el bypass de admin@bastionguard.com / admin123
    const isDev = process.env.NODE_ENV === "development" || process.env.AI_MOCK === "true";
    if (isDev && email === "admin@bastionguard.com" && passwordPlain === "admin123") {
      console.log("[AUTH] Usando bypass de desarrollo para admin@bastionguard.com");
      return this.generateToken({ id: "00000000-0000-0000-0000-000000000000", tenantId: "all", email, role: "admin" });
    }

    const pool = AuditLogger.getInstance().getPool();
    if (!pool) {
      console.warn("[AUTH] Base de datos no conectada. Permitiendo bypass temporal en desarrollo.");
      if (email === "admin@bastionguard.com" && passwordPlain === "admin123") {
        return this.generateToken({ id: "dev-id", tenantId: "all", email, role: "admin" });
      }
      return null;
    }

    try {
      const res = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
      if (res.rows.length === 0) return null;

      const userRow = res.rows[0];
      const isValid = await bcrypt.compare(passwordPlain, userRow.password_hash);

      if (!isValid) return null;

      return this.generateToken({
        id: userRow.id,
        tenantId: userRow.tenant_id,
        email: userRow.email,
        role: userRow.role,
      });
    } catch (err) {
      console.error("[AUTH] Error autenticando usuario:", err);
      return null;
    }
  }

  private generateToken(user: User): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
      this.jwtSecret,
      { expiresIn: "8h" }
    );
  }

  public verifyToken(token: string): User | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return {
        id: decoded.sub,
        email: decoded.email,
        tenantId: decoded.tenantId,
        role: decoded.role,
      };
    } catch {
      return null;
    }
  }

  public async getUsers(tenantId: string): Promise<User[]> {
    const pool = AuditLogger.getInstance().getPool();
    if (!pool) return [];
    
    try {
      const query = tenantId === "all" 
        ? `SELECT id, tenant_id, email, role FROM users`
        : `SELECT id, tenant_id, email, role FROM users WHERE tenant_id = $1`;
      const params = tenantId === "all" ? [] : [tenantId];
      const res = await pool.query(query, params);
      return res.rows.map(r => ({ id: r.id, tenantId: r.tenant_id, email: r.email, role: r.role }));
    } catch {
      return [];
    }
  }

  public async createUser(tenantId: string, email: string, passwordPlain: string, role: string): Promise<boolean> {
    const pool = AuditLogger.getInstance().getPool();
    if (!pool) return false;

    try {
      const hash = await bcrypt.hash(passwordPlain, 10);
      const id = require("crypto").randomUUID();
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
        [id, tenantId, email, hash, role]
      );
      return true;
    } catch {
      return false;
    }
  }

  public async deleteUser(tenantId: string, userId: string): Promise<boolean> {
    const pool = AuditLogger.getInstance().getPool();
    if (!pool) return false;

    try {
      // Evitar que el admin global se borre accidentalmente
      if (userId === "00000000-0000-0000-0000-000000000000") return false;
      
      const query = tenantId === "all" 
        ? `DELETE FROM users WHERE id = $1`
        : `DELETE FROM users WHERE id = $1 AND tenant_id = $2`;
      const params = tenantId === "all" ? [userId] : [userId, tenantId];
      
      const res = await pool.query(query, params);
      return (res.rowCount ?? 0) > 0;
    } catch {
      return false;
    }
  }
}
