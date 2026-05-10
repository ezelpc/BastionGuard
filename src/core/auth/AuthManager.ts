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
}
