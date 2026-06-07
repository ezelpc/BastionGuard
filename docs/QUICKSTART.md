# 🚀 Quick Start Guide - BastionGuard

Esta guía te ayudará a configurar BastionGuard en tu máquina local en menos de 5 minutos.

## Prerequisites

Asegúrate de tener instalado:

- **Node.js** >= 20.0.0 ([Descargar](https://nodejs.org/))
- **npm** >= 10.0.0 (incluido con Node.js)
- **Docker Desktop** con **WSL2 Integration habilitada** (para servicios)
- **Git** (para clonar el repo)

## ⚡ Quick Setup (3 pasos)

### 1. Clone & Setup

```bash
# Clone el repositorio
git clone https://github.com/tu-org/bastionguard.git
cd bastionguard

# Ejecutar script de setup (crea .env automáticamente)
bash scripts/setup.sh

# Verificar que todo esté bien
npm run type-check
```

### 2. Configurar API Keys

Edita el archivo `.env` con tus credenciales:

```bash
# Editor de tu preferencia
nano .env
# or
code .env
```

**Mínimo requerido:**

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Opcional pero recomendado:**

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Iniciar Servicios

```bash
# Terminal 1: Iniciar PostgreSQL y Redis
docker compose up -d

# Terminal 2: Iniciar servidor de desarrollo
npm run dev

# Terminal 3: (Opcional) Monitor de recursos
# npm run dev:watch
```

✅ **¡Listo!** Abre http://localhost:3000 en tu navegador.

---

## 🎬 Próximos Pasos

### Enviar tu primer Alert (Prometheus)

```bash
curl -X POST http://localhost:3000/webhook/prometheus \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {
        "severity": "critical",
        "job": "api-gateway"
      },
      "annotations": {
        "summary": "High CPU usage"
      }
    }]
  }'
```

### Ejecutar Demo Interactiva

```bash
npm run demo
```

### Ver Tests

```bash
npm run test
npm run test:watch
```

---

## 🔧 Comandos Útiles

```bash
# Development
npm run dev               # Start dev server
npm run dev:watch        # Auto-reload
npm run demo             # Interactive demo
npm run build            # Build TypeScript
npm run build:watch      # Watch build

# Quality
npm run lint             # Check code style
npm run lint:fix         # Auto-fix
npm run format           # Format code
npm run type-check       # Type check

# Testing
npm run test             # Run tests
npm run test:watch       # Watch tests
npm run test:coverage    # Coverage report

# Makefile (más opciones)
make help                # Show all commands
make docker-up           # Start containers
make security-scan       # Run security scans
```

---

## 🐛 Troubleshooting

### ❌ "docker: command not found"

**Solución:** Docker Desktop no tiene WSL2 integration habilitada.

1. Abre **Docker Desktop Settings**
2. Ve a **Resources → WSL Integration**
3. Habilita `Ubuntu-24.04` (u otra distro)
4. Aplica cambios
5. En terminal: `wsl --shutdown`

### ❌ "Cannot find module '@anthropic-ai/sdk'"

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### ❌ "Connection refused - PostgreSQL"

```bash
# Verifica que Docker esté corriendo
docker ps

# Si no ves bastionguard-postgres, inicia servicios:
docker compose up -d

# Verifica logs
docker compose logs postgres
```

### ❌ "EADDRINUSE: address already in use :::3000"

Algo ya está usando el puerto 3000.

```bash
# Usa puerto diferente
API_PORT=3001 npm run dev

# O mata el proceso
lsof -ti:3000 | xargs kill -9
```

---

## 📚 Documentación

| Recurso                                             | Descripción                      |
| --------------------------------------------------- | -------------------------------- |
| [README.md](../README.md)                           | Descripción general del proyecto |
| [DEVSECOPS.md](../DEVSECOPS.md)                     | Configuración de seguridad       |
| [docs/API.md](API.md)                               | Referencia completa de API       |
| [src/config/tenants.yml](../src/config/tenants.yml) | Configuración de tenants         |

---

## 🤝 Contribuir

Si encuentras problemas o tienes mejoras:

1. Fork el proyecto
2. Crea una rama: `git checkout -b feature/my-feature`
3. Commit: `git commit -am 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Abre un Pull Request

---

## 💡 Tips

- **Modo Dry-Run:** Para pruebas seguras, las acciones se simularán sin impacto real
- **Tenant Config:** Personaliza permisos de cada cliente en `src/config/tenants.yml`
- **Logs:** Revisa `data/audit-log.jsonl` para histórico completo
- **WebSocket:** El dashboard conecta en tiempo real para ver eventos

---

## 📞 Soporte

Contacta al equipo o abre un issue en GitHub si tienes preguntas.

**¡Happy coding! 🛡️**
