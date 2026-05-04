#!/bin/bash

set -e

echo "🚀 Iniciando post-create setup para BastionGuard..."

# Actualizar npm
echo "📦 Actualizando npm..."
npm install -g npm@latest --loglevel=warn

# Instalar dependencias del proyecto
echo "📥 Instalando dependencias del proyecto..."
npm install --prefer-offline --no-audit

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npm run build 2>/dev/null || true

# Crear scripts útiles si no existen
if ! grep -q "\"dev\"" package.json; then
  echo "📝 Actualizando package.json con scripts..."
  npm set-script dev "ts-node src/test-executor.ts"
  npm set-script build "tsc"
  npm set-script lint "eslint src --ext .ts"
  npm set-script format "prettier --write 'src/**/*.ts'"
fi

# Crear alias útiles
cat >> ~/.bashrc <<'EOF'
# BastionGuard aliases
alias bg-test="npm run test"
alias bg-dev="npm run dev"
alias bg-build="npm run build"
alias bg-lint="npm run lint"
alias bg-format="npm run format"
alias bg-scan="bash ./scripts/security-scan.sh"
alias k="kubectl"
alias d="docker"
alias dcps="docker-compose ps"

# Función para ejecutar BastionGuard
bg-exec() {
  npm run dev -- "$@"
}

# Color para terminal
export CLICOLOR=1
export LSCOLORS=GxFxCxDxBxegedabagaced

# Configuración de git para DevSecOps
git config --local core.hooksPath .githooks 2>/dev/null || true

echo "🔒 BastionGuard DevSecOps Environment Ready!"
EOF

# Crear directorio de logs
mkdir -p logs
mkdir -p .scan-results

# Crear git hooks para seguridad (si el directorio .githooks existe)
if [ -d ".githooks" ]; then
  echo "🔐 Configurando git hooks de seguridad..."
  chmod +x .githooks/* 2>/dev/null || true
  git config --local core.hooksPath .githooks 2>/dev/null || true
fi

echo ""
echo "✅ Post-create setup completado exitosamente!"
echo ""


# Verificar versiones instaladas
echo ""
echo "✅ Setup completado!"
echo ""
echo "📋 Versiones instaladas:"
echo "  Node: $(node --version)"
echo "  NPM: $(npm --version)"
echo "  TypeScript: $(npx tsc --version)"
echo "  Kubectl: $(kubectl version --client --short 2>/dev/null || echo 'no instalado')"
echo ""
echo "💡 Comandos útiles:"
echo "  npm run dev      - Ejecutar test-executor"
echo "  npm run build    - Compilar TypeScript"
echo "  npm run test     - Ejecutar tests"
echo "  bg-exec          - Ejecutar acciones (alias)"
echo ""
