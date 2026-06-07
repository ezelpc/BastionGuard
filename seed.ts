import { AuditLogger } from "./src/core/audit/AuditLogger";
import { AuthManager } from "./src/core/auth/AuthManager";
import bcrypt from "bcryptjs";

async function seedUsers() {
  const logger = AuditLogger.getInstance();
  await logger.initDb(); // Asegura conexión y tablas
  
  const pool = logger.getPool();
  if (!pool) {
    console.log("No se pudo conectar a la BD");
    return;
  }

  const auth = new AuthManager();

  // Crear 1 admin y 2 operadores
  const users = [
    { email: "operador1@empresa-a.com", pass: "1234", role: "operator", tenant: "empresa-a" },
    { email: "operador2@empresa-b.com", pass: "1234", role: "operator", tenant: "empresa-b" },
    { email: "gerente@bastionguard.com", pass: "admin123", role: "admin", tenant: "all" }
  ];

  console.log("Creando usuarios de prueba...");
  for (const u of users) {
    const res = await pool.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
    if (res.rowCount === 0) {
      await auth.createUser(u.tenant, u.email, u.pass, u.role);
      console.log(`✅ Creado: ${u.email} (${u.role})`);
    } else {
      console.log(`⚠️ Ya existe: ${u.email}`);
    }
  }

  console.log("\\nUsuarios actuales en la base de datos:");
  const allUsers = await pool.query(`SELECT email, role, tenant_id FROM users`);
  console.table(allUsers.rows);

  process.exit(0);
}

seedUsers();
