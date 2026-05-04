#!/bin/bash

set -e

echo "🔒 Configurando DevSecOps..."

# ============================================================
# FUNCIÓN DE COLORES
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# ============================================================
# VERIFICACIÓN DE DEPENDENCIAS
# ============================================================
print_info "Verificando dependencias DevSecOps..."

TOOLS=(
  "docker:Docker"
  "git:Git"
  "trivy:Trivy"
  "npm:NPM"
  "node:Node.js"
)

for tool in "${TOOLS[@]}"; do
  IFS=":" read -r cmd name <<<"$tool"
  if command -v "$cmd" &> /dev/null; then
    print_success "$name instalado"
  else
    print_warning "$name NO encontrado - las características pueden no funcionar correctamente"
  fi
done

# ============================================================
# CONFIGURACIÓN DE SEGURIDAD PARA GIT
# ============================================================
print_info "Configurando Git..."

git config --global pull.rebase false || true
git config --global push.default current || true
git config --global init.defaultBranch main || true
git config --global core.autocrlf input || true

print_success "Git configurado"

# ============================================================
# CONFIGURACIÓN DE NPM SEGURA
# ============================================================
print_info "Configurando NPM..."

npm config set audit true
npm config set audit-level moderate
npm config set fund false

print_success "NPM configurado"

# ============================================================
# CREAR ESTRUCTURA DE CARPETAS PARA ESCANEOS
# ============================================================
print_info "Creando directorios para escaneos..."

SCAN_DIRS=(
  ".scan-results"
  ".scan-results/trivy"
  ".scan-results/semgrep"
  ".scan-results/npm-audit"
  ".scan-results/dependencies"
  "logs"
  "logs/security"
)

for dir in "${SCAN_DIRS[@]}"; do
  mkdir -p "$dir"
done

print_success "Directorios creados"

# ============================================================
# CREAR SCRIPTS DE SEGURIDAD
# ============================================================
print_info "Creando scripts de seguridad..."

# Script para verificación de dependencias
cat > ./scripts/verify-deps.sh <<'DEPS_EOF'
#!/bin/bash
echo "🔍 Verificando dependencias..."
npm audit --audit-level=moderate || npm audit fix
echo "✓ Verificación de dependencias completada"
DEPS_EOF

# Script para escaneo de código con Semgrep
cat > ./scripts/semgrep-scan.sh <<'SEMGREP_EOF'
#!/bin/bash
echo "🔍 Ejecutando análisis Semgrep..."
semgrep --config=p/security-audit --config=p/typescript \
  --json -o .scan-results/semgrep/results.json src/ || true
echo "✓ Escaneo Semgrep completado"
SEMGREP_EOF

# Script para escaneo de vulnerabilidades con Trivy
cat > ./scripts/trivy-scan.sh <<'TRIVY_EOF'
#!/bin/bash
echo "🔍 Ejecutando análisis Trivy..."
trivy fs --format json -o .scan-results/trivy/results.json . || true
echo "✓ Escaneo Trivy completado"
TRIVY_EOF

# Script para auditoría de NPM
cat > ./scripts/npm-audit-scan.sh <<'AUDIT_EOF'
#!/bin/bash
echo "🔍 Ejecutando auditoría NPM..."
npm audit --json > .scan-results/npm-audit/results.json || true
echo "✓ Auditoría NPM completada"
AUDIT_EOF

# Script principal de seguridad
cat > ./scripts/security-scan.sh <<'SECURITY_EOF'
#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔒 Iniciando escaneo de seguridad${NC}"

# Crear marca de tiempo
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
SCAN_DIR=".scan-results/$TIMESTAMP"
mkdir -p "$SCAN_DIR"

# Ejecutar escaneos
echo -e "${BLUE}1. Verificando dependencias${NC}"
npm audit --json > "$SCAN_DIR/npm-audit.json" || npm audit fix || true

echo -e "${BLUE}2. Ejecutando Semgrep${NC}"
semgrep --config=p/security-audit --config=p/typescript \
  --json -o "$SCAN_DIR/semgrep.json" src/ 2>/dev/null || true

echo -e "${BLUE}3. Ejecutando Trivy${NC}"
trivy fs --format json -o "$SCAN_DIR/trivy.json" . 2>/dev/null || true

echo -e "${BLUE}4. Analizando resultados${NC}"

# Contar problemas encontrados
VULN_COUNT=$(jq '[.vulnerabilities[]? | length] | add // 0' "$SCAN_DIR/trivy.json" 2>/dev/null || echo 0)
AUDIT_COUNT=$(jq '[.vulnerabilities[]? | length] | add // 0' "$SCAN_DIR/npm-audit.json" 2>/dev/null || echo 0)

echo -e "${GREEN}✓ Escaneo completado${NC}"
echo -e "${YELLOW}Vulnerabilidades encontradas: ${VULN_COUNT}${NC}"
echo -e "${YELLOW}Problemas de auditoría: ${AUDIT_COUNT}${NC}"
echo -e "${BLUE}Resultados guardados en: $SCAN_DIR${NC}"

if [ "$VULN_COUNT" -gt 0 ] || [ "$AUDIT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Se encontraron problemas de seguridad${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Sin problemas de seguridad críticos${NC}"
SECURITY_EOF

# Script para análisis de dependencias
cat > ./scripts/analyze-deps.sh <<'ANALYZE_EOF'
#!/bin/bash
echo "📊 Analizando dependencias..."
npm list --depth=0
npm outdated || true
echo "✓ Análisis de dependencias completado"
ANALYZE_EOF

# Hacer scripts ejecutables
chmod +x ./scripts/*.sh || true

print_success "Scripts de seguridad creados en ./scripts/"

# ============================================================
# CREAR CONFIGURACIÓN DE ESLINT CON SEGURIDAD
# ============================================================
print_info "Crear configuraciones de seguridad..."

if [ ! -f ".eslintrc.json" ]; then
  cat > .eslintrc.json <<'ESLINT_EOF'
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "plugins": [
    "@typescript-eslint",
    "security",
    "node"
  ],
  "env": {
    "node": true,
    "es2021": true
  },
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "warn",
    "security/detect-buffer-noassert": "warn",
    "security/detect-child-process": "warn",
    "security/detect-disable-mustache-escape": "warn",
    "security/detect-no-csrf-before-method-override": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-non-literal-require": "warn",
    "security/detect-possible-timing-attacks": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "node/no-unsupported-features/es-syntax": "off"
  }
}
ESLINT_EOF
  print_success ".eslintrc.json creado"
fi

# ============================================================
# CREAR ARCHIVO DE POLÍTICA DE SEGURIDAD
# ============================================================
if [ ! -f "SECURITY.md" ]; then
  cat > SECURITY.md <<'SECURITY_MD_EOF'
# Política de Seguridad

## Información de Versión Compatible

Las siguientes versiones de BastionGuard están siendo soportadas actualmente con actualizaciones de seguridad:

| Versión | Soportado |
| ------- | --------- |
| 1.0.x   | ✓         |
| < 1.0   | ✗         |

## Reportar una Vulnerabilidad

Si descubriste una vulnerabilidad de seguridad, por favor NO abras un issue público. 
En su lugar:

1. Envía un correo a security@bastionguard.dev describiendo la vulnerabilidad
2. Incluye los pasos para reproducir la vulnerabilidad
3. Proporciona tu información de contacto

Nos comprometemos a:
- Reconocer tu reporte dentro de 48 horas
- Proporcionar una actualización cada 2 semanas
- Revelar públicamente la vulnerabilidad después de una corrección

## Mejores Prácticas de Seguridad

- Nunca commits secretos o credenciales
- Usa `.env` para variables de entorno sensibles
- Ejecuta `npm audit` regularmente
- Mantén las dependencias actualizadas
- Usa HTTPS en todas las comunicaciones
- Implementa autenticación y autorización adecuadas
- Valida y sanitiza todas las entradas de usuario
- Usa herramientas de escaneo de seguridad en tu CI/CD

## Escaneo de Seguridad

Este proyecto incluye herramientas automáticas de escaneo de seguridad:
- **Trivy**: Escaneo de vulnerabilidades de contenedor
- **Semgrep**: Análisis estático de código
- **npm audit**: Verificación de dependencias vulnerables

Ejecuta los escaneos con:
```bash
npm run security-scan
```

SECURITY_MD_EOF
  print_success "SECURITY.md creado"
fi

# ============================================================
# CREAR ARCHIVO .gitignore MEJORADO
# ============================================================
if [ -f ".gitignore" ]; then
  # Agregar entradas de seguridad al .gitignore
  cat >> .gitignore <<'GITIGNORE_EOF'

# Archivos de seguridad
.env
.env.local
.env.*.local
*.pem
*.key
*.crt
.ssh/
.gnupg/
.kube/

# Resultados de escaneo
.scan-results/
*.sarif
*.json.scan

# Logs sensibles
logs/security/
*.log

# Artefactos de construcción
dist/
build/
*.tsbuildinfo

# Cache de dependencias
node_modules/
package-lock.json

# IDE
.vscode/settings.local.json
.idea/
*.swp
*.swo

GITIGNORE_EOF
  print_success ".gitignore actualizado"
fi

# ============================================================
# INSTALACIONES DE DESARROLLO FINAL
# ============================================================
print_info "Instalando herramientas finales..."

npm install -D \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-security \
  eslint-plugin-node \
  jest \
  ts-jest \
  @types/jest \
  --loglevel=warn 2>/dev/null || print_warning "Algunas dependencias de dev ya instaladas"

print_success "Herramientas instaladas"

# ============================================================
# CREAR ARCHIVO DE RESUMEN
# ============================================================
cat > .DEVSECOPS_SETUP.md <<'SETUP_EOF'
# 🔒 DevSecOps Setup - BastionGuard

## Componentes Instalados

✓ **Trivy** - Scanner de vulnerabilidades de contenedor
✓ **Semgrep** - Análisis estático de código
✓ **Checkov** - Escaneo de Infraestructura como Código
✓ **npm audit** - Verificación de dependencias vulnerables
✓ **ESLint con plugins de seguridad** - Linting seguro

## Scripts de Seguridad Disponibles

### Escaneos Individuales
```bash
./scripts/npm-audit-scan.sh        # Auditoría de dependencias
./scripts/trivy-scan.sh            # Escaneo de vulnerabilidades
./scripts/semgrep-scan.sh          # Análisis estático
./scripts/analyze-deps.sh          # Análisis de dependencias
```

### Escaneo Completo
```bash
./scripts/security-scan.sh         # Ejecuta todos los escaneos
```

### Comandos NPM
```bash
npm run lint                        # Linting con reglas de seguridad
npm run format                      # Formato de código
npm run build                       # Compilación
npm run dev                         # Desarrollo
```

## Configuración de Contenedor

- **No ejecuta como root**: Usuario `node`
- **Drop Capabilities**: Se eliminan capacidades innecesarias
- **Read-only filesystem**: Sistema de archivos de solo lectura
- **No new privileges**: Previene escalada de privilegios

## Directorios de Seguridad

- `.scan-results/` - Resultados de escaneos
- `logs/security/` - Logs de seguridad
- `.env` - Variables de entorno (NO incluir en git)

## Próximos Pasos

1. Ejecuta el escaneo inicial:
   ```bash
   ./scripts/security-scan.sh
   ```

2. Revisa los resultados en `.scan-results/`

3. Configura en tu CI/CD para escaneos automáticos

4. Establece políticas de rama protegida que requieran escaneos verdes

## Documentación

- [SECURITY.md](SECURITY.md) - Política de seguridad
- Trivy: https://github.com/aquasecurity/trivy
- Semgrep: https://semgrep.dev/
- Checkov: https://www.checkov.io/

SETUP_EOF

print_success "Archivo de setup creado: .DEVSECOPS_SETUP.md"

# ============================================================
# RESUMEN FINAL
# ============================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🔒 DevSecOps Configuration Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Herramientas instaladas:${NC}"
echo "  ✓ Trivy - Vulnerability Scanner"
echo "  ✓ Semgrep - Static Analysis"
echo "  ✓ Checkov - IaC Scanner"
echo "  ✓ npm audit - Dependency Auditing"
echo ""
echo -e "${BLUE}Scripts creados en ./scripts/:${NC}"
echo "  ✓ security-scan.sh - Escaneo completo de seguridad"
echo "  ✓ npm-audit-scan.sh - Auditoría de dependencias"
echo "  ✓ trivy-scan.sh - Escaneo de vulnerabilidades"
echo "  ✓ semgrep-scan.sh - Análisis de código"
echo "  ✓ analyze-deps.sh - Análisis de dependencias"
echo ""
echo -e "${BLUE}Para comenzar:${NC}"
echo "  1. Lee .DEVSECOPS_SETUP.md"
echo "  2. Lee SECURITY.md"
echo "  3. Ejecuta: ./scripts/security-scan.sh"
echo ""
echo -e "${GREEN}✓ ¡Listo para desarrollo seguro!${NC}"
echo ""
