# 🔒 DevSecOps Setup - BastionGuard

Configuración optimizada de **Development Security Operations** para el proyecto BastionGuard. Este setup integra herramientas de escaneo de seguridad, análisis estático de código, y auditoría de dependencias.

## 📋 Contenido

- [Características](#características)
- [Herramientas Incluidas](#herramientas-incluidas)
- [Instalación Rápida](#instalación-rápida)
- [Uso Diario](#uso-diario)
- [Scripts de Seguridad](#scripts-de-seguridad)
- [Configuración de CI/CD](#configuración-de-cicd)
- [Mejores Prácticas](#mejores-prácticas)

## ✨ Características

### Seguridad en Contenedores

- ✅ **Drop Capabilities**: Elimina permisos innecesarios
- ✅ **No root**: Ejecución como usuario `node`
- ✅ **Read-only filesystem**: Sistema de archivos protegido
- ✅ **No new privileges**: Previene escalada de privilegios

### Escaneo Automático

- ✅ **Trivy**: Detección de vulnerabilidades en dependencias
- ✅ **Semgrep**: Análisis estático de código
- ✅ **npm audit**: Auditoría de paquetes NPM
- ✅ **Checkov**: Validación de Infraestructura como Código

### Git Security

- ✅ **Pre-commit hooks**: Verificaciones antes de cada commit
- ✅ **Detección de secretos**: Previene commit de credenciales
- ✅ **Type checking**: Validación de tipos automática
- ✅ **Linting**: Verificación de calidad de código

## 🛠️ Herramientas Incluidas

### Escaneo de Vulnerabilidades

| Herramienta   | Propósito                                 | Uso                       |
| ------------- | ----------------------------------------- | ------------------------- |
| **Trivy**     | Escaneo de vulnerabilidades de contenedor | `make security-trivy`     |
| **npm audit** | Auditoría de dependencias Node            | `make security-npm`       |
| **Semgrep**   | Análisis estático de código               | `make security-semgrep`   |
| **Checkov**   | Escaneo de IaC (Terraform, Docker, K8s)   | Integrado en docker-build |

### Desarrollo Seguro

| Herramienta          | Propósito                           |
| -------------------- | ----------------------------------- |
| **ESLint + Plugins** | Detección de patrones inseguros     |
| **Pre-commit hooks** | Verificaciones antes de commit      |
| **Git config**       | Configuración segura de repositorio |

### Monitoreo

| Herramienta    | Propósito                 | Puerto |
| -------------- | ------------------------- | ------ |
| **Prometheus** | Recolección de métricas   | 9090   |
| **Grafana**    | Visualización de métricas | 3001   |
| **PostgreSQL** | Base de datos             | 5432   |
| **Redis**      | Cache y sesiones          | 6379   |

## 🚀 Instalación Rápida

### 1. Requisitos Previos

```bash
# Instalados en el contenedor:
- Docker/Docker Compose
- Node.js 20+
- TypeScript
- Python 3 (para Semgrep, Checkov)

# Opcionales locales:
- Trivy (para escaneo local)
- Semgrep CLI (para análisis local)
```

### 2. Configuración Inicial

```bash
# Clonar repositorio
git clone <repo> bastionguard
cd bastionguard

# Setup inicial
make setup

# Setup de git hooks de seguridad
make git-hooks-setup

# Verificar instalación
make info
```

### 3. Verificar Herramientas

```bash
# Comprobar que todo está instalado
make info

# Debería mostrar:
# ✓ Trivy
# ✓ Semgrep
# ✓ Checkov
```

## 📅 Uso Diario

### Desarrollo Normal

```bash
# Instalar dependencias
make install

# Desarrollar
make dev

# En otra terminal, ejecutar tests
make test

# Lint y format
make lint
make format
```

### Verificaciones de Seguridad

```bash
# Escaneo rápido (solo npm)
make security-npm

# Escaneo completo
make security-scan

# Verificar dependencias desactualizadas
make deps-check

# Corregir vulnerabilidades
make security-npm-fix
```

### Pre-commit (Automático)

Los hooks de git se ejecutan automáticamente antes de cada commit:

```bash
# Intenta hacer commit (ejecutará hooks automáticamente)
git add .
git commit -m "feat: new feature"

# Si falla por seguridad:
git commit --no-verify  # Solo en casos excepcionales
```

## 🔒 Scripts de Seguridad

Ubicados en `./scripts/`:

### `security-scan.sh` - Escaneo Completo

```bash
./scripts/security-scan.sh

# Genera resultados en: .scan-results/TIMESTAMP/
# - npm-audit.json
# - trivy.json
# - semgrep.json
```

### `npm-audit-scan.sh` - Auditoría de Dependencias

```bash
./scripts/npm-audit-scan.sh
# Solo escaneo de vulnerabilidades de NPM
```

### `trivy-scan.sh` - Escaneo de Vulnerabilidades

```bash
./scripts/trivy-scan.sh
# Escaneo completo del filesystem
```

### `analyze-deps.sh` - Análisis de Dependencias

```bash
./scripts/analyze-deps.sh
# Muestra dependencias instaladas y desactualizadas
```

## 🔄 Configuración de CI/CD

### GitHub Actions

```yaml
name: Security Scan

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Run security scan
        run: make security-scan

      - name: Upload results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: .scan-results/trivy-results.sarif
```

### GitLab CI

```yaml
security-scan:
  stage: test
  image: node:20
  script:
    - npm install
    - make security-scan
  artifacts:
    paths:
      - .scan-results/
    reports:
      sast: .scan-results/semgrep/results.json
```

## 🎯 Mejores Prácticas

### 1. Nunca Commitear Secretos

```bash
# ❌ MAL - Estos serán rechazados por pre-commit
password: "secret123"
API_KEY: "sk-1234567890"
token: "ghp_xxxxxxxxxxxx"

# ✅ BIEN - Usar .env (NO incluir en git)
REACT_APP_API_URL=https://api.example.com
```

### 2. Mantener Dependencias Actualizadas

```bash
# Revisar dependencias desactualizadas
make deps-check

# Actualizar (con cuidado)
make deps-update

# Auditar después de actualizar
make security-npm
```

### 3. Escanear Regularmente

```bash
# Antes de cada merge/PR
make security-scan

# Revisar resultados
cat .scan-results/LATEST/trivy.json | jq '.vulnerabilities[] | select(.severity=="CRITICAL")'
```

### 4. Code Review Seguro

```bash
# Antes de revisar código
git pull
npm install
make lint
make security-npm

# Luego revisar cambios
git diff origin/main
```

### 5. Git Hooks Activos

```bash
# Verificar que los hooks están configurados
git config core.hooksPath

# Debería mostrar: .githooks

# El hook pre-commit verificará:
✓ Búsqueda de secretos
✓ Archivos .env
✓ Linting
✓ Type checking
```

## 📊 Resultados de Escaneo

Los resultados se guardan en `.scan-results/TIMESTAMP/`:

### Formatos Soportados

- **JSON**: Para procesamiento automático
- **SARIF**: Para integración con GitHub Security
- **HTML**: Para visualización (generar manualmente)

### Interpretar Resultados

```bash
# Ver vulnerabilidades críticas de Trivy
cat .scan-results/TIMESTAMP/trivy.json | jq '.Vulnerabilities[] | select(.Severity=="CRITICAL")'

# Ver problemas de Semgrep
cat .scan-results/TIMESTAMP/semgrep.json | jq '.results[] | select(.severity=="ERROR")'

# Ver dependencias vulnerables
cat .scan-results/TIMESTAMP/npm-audit.json | jq '.vulnerabilities[]'
```

## 🚨 Resolución de Problemas

### Trivy no disponible

```bash
# Instalar Trivy localmente
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# O usar a través de Docker
docker run aquasec/trivy fs .
```

### Semgrep no disponible

```bash
# Instalar
pip install semgrep

# O en el contenedor
pip3 install semgrep --break-system-packages
```

### Pre-commit hooks no ejecutándose

```bash
# Reconfi gurar
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit

# Verificar
git config core.hooksPath
```

## 📚 Referencias

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Semgrep Rules](https://semgrep.dev/r)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/2022/)
- [npm audit Documentation](https://docs.npmjs.com/cli/v9/commands/npm-audit)

## 🤝 Contribuir Seguramente

1. Crea una rama feature: `git checkout -b feature/new-feature`
2. Haz cambios y commit (hooks se ejecutarán automáticamente)
3. Ejecuta escaneos: `make security-scan`
4. Push a la rama: `git push origin feature/new-feature`
5. Crea un Pull Request
6. CI/CD ejecutará escaneos automáticos

## 📞 Soporte

Para problemas o preguntas sobre DevSecOps:

1. Consulta [SECURITY.md](../SECURITY.md)
2. Revisa los logs: `cat logs/security/*.log`
3. Ejecuta diagnóstico: `make info`

---

**Última actualización**: 2026-05-03
**Versión**: 1.0.0
**Estatus**: ✅ Producción
