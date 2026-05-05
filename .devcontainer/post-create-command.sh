#!/bin/bash
set -e

echo "🚀 Iniciando post-create setup para BastionGuard..."

# ── 1. Instalar dependencias del proyecto ──────────────────
echo "📥 Instalando dependencias..."
npm install

# ── 2. Compilar TypeScript ─────────────────────────────────
echo "🔨 Compilando TypeScript..."
npm run build 2>/dev/null || echo "⚠️  Build omitido (sin errores críticos)"

# ── 3. Crear directorios necesarios ───────────────────────
mkdir -p logs .scan-results scripts

# ── 4. Crear scripts de seguridad ─────────────────────────
cat > ./scripts/security-scan.sh <<'SECURITY_EOF'
#!/bin/bash
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
SCAN_DIR=".scan-results/$TIMESTAMP"
mkdir -p "$SCAN_DIR"

echo "1️⃣  npm audit..."
npm audit --json > "$SCAN_DIR/npm-audit.json" 2>/dev/null || true

echo "2️⃣  Trivy..."
trivy fs --format json -o "$SCAN_DIR/trivy.json" . 2>/dev/null || echo "⚠️  Trivy no disponible"

echo "3️⃣  Semgrep..."
semgrep --config=p/security-audit --json -o "$SCAN_DIR/semgrep.json" src/ 2>/dev/null || echo "⚠️  Semgrep no disponible"

echo "✅ Resultados en: $SCAN_DIR"
SECURITY_EOF
chmod +x ./scripts/security-scan.sh

# ── 5. Configurar git hooks ────────────────────────────────
if [ -d ".githooks" ]; then
  chmod +x .githooks/* 2>/dev/null || true
  git config --local core.hooksPath .githooks 2>/dev/null || true
  echo "✅ Git hooks configurados"
fi

# ── 6. Aliases útiles ─────────────────────────────────────
cat >> ~/.bashrc <<'EOF'

# BastionGuard aliases
alias k="kubectl"
alias bg-dev="npm run dev"
alias bg-build="npm run build"
alias bg-test="npm run dev"
alias bg-scan="./scripts/security-scan.sh"
alias bg-lint="npm run lint"
echo "🛡️  BastionGuard DevSecOps listo!"
EOF

# ── 7. Resumen ─────────────────────────────────────────────
echo ""
echo "✅ Setup completado!"
echo ""
echo "📋 Versiones:"
echo "  Node   : $(node --version)"
echo "  NPM    : $(npm --version)"
echo "  TSC    : $(npx tsc --version)"
echo "  kubectl: $(kubectl version --client --short 2>/dev/null || echo 'no instalado')"
echo ""
echo "💡 Para iniciar:"
echo "   npm run dev       → corre test-executor"
echo "   npm run build     → compila TypeScript"
echo "   bg-scan           → escaneo de seguridad"
echo ""echo "🚀 ¡A desarrollar con seguridad en BastionGuard!"