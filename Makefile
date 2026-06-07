.PHONY: help install setup setup-wsl2 dev dev-watch build build-watch test lint format clean docker-up docker-down docker-logs security-scan security-npm security-trivy security-semgrep deps-check git-hooks-setup

TIMESTAMP := $(shell date +%Y-%m-%d_%H-%M-%S)
DOCKER_IMAGE := bastionguard:latest

help:
	@echo "BastionGuard Development Commands"
	@echo "=================================="
	@echo "Setup & Init:"
	@echo "  make setup             - Initialize project (.env, deps)"
	@echo "  make setup-wsl2        - Check WSL2 + Docker configuration"
	@echo "  make install           - Install npm dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev               - Run development server"
	@echo "  make dev-watch         - Run with auto-reload"
	@echo "  make demo              - Run interactive demo"
	@echo "  make build             - Build TypeScript"
	@echo "  make build-watch       - Build with watching"
	@echo ""
	@echo "Quality:"
	@echo "  make lint              - Check code quality"
	@echo "  make lint-fix          - Auto-fix linting issues"
	@echo "  make format            - Format code with Prettier"
	@echo "  make format-check      - Check formatting"
	@echo "  make type-check        - Run TypeScript type checker"
	@echo "  make test              - Run tests"
	@echo "  make test:watch        - Run tests in watch mode"
	@echo ""
	@echo "Security (DevSecOps):"
	@echo "  make security-scan     - Full security scan"
	@echo "  make security-npm      - NPM audit only"
	@echo "  make security-trivy    - Trivy scan only"
	@echo "  make security-semgrep  - Semgrep analysis only"
	@echo "  make deps-check        - Check outdated dependencies"
	@echo ""
	@echo "Docker & Services:"
	@echo "  make docker-up         - Start dev container"
	@echo "  make docker-down       - Stop dev container"
	@echo "  make docker-logs       - View container logs"
	@echo "  make docker-shell      - Access container shell"
	@echo "  make docker-build      - Build Docker image"
	@echo "  make services-up       - Start postgres + redis"
	@echo "  make services-down     - Stop services"
	@echo "  make services-status   - Show services status"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean             - Clean build artifacts"

setup: setup-wsl2 install
	@echo "✅ Setup complete! Run 'npm run dev' to start"

setup-wsl2:
	@bash scripts/setup-wsl2.sh || true

install:
	npm install

setup:
	bash scripts/setup.sh
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up         - Start dev container"
	@echo "  make docker-down       - Stop dev container"
	@echo "  make docker-logs       - View container logs"
	@echo "  make docker-shell      - Access container shell"
	@echo "  make docker-build      - Build Docker image"
	@echo ""
	@echo "Services:"
	@echo "  make services-up       - Start all services"
	@echo "  make services-down     - Stop all services"
	@echo "  make services-status   - Show services status"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean             - Clean build artifacts"

install:
	npm install

dev:
	npm run dev

dev-watch:
	npm run dev:watch

build:
	npm run build

build-watch:
	npm run build:watch

lint:
	npm run lint

lint-fix:
	npm run lint:fix

format:
	npm run format

format-check:
	npm run format:check

type-check:
	npm run type-check

test:
	npm run test

clean:
	npm run clean

# ============================================================
# SECURITY TARGETS (DevSecOps)
# ============================================================

security-scan:
	@echo "🔒 Iniciando escaneo de seguridad completo..."
	@mkdir -p .scan-results/$(TIMESTAMP)
	@echo "1️⃣ Ejecutando npm audit..."
	@npm audit --json > .scan-results/$(TIMESTAMP)/npm-audit.json || npm audit fix || true
	@echo "2️⃣ Ejecutando Trivy..."
	@trivy fs --format json -o .scan-results/$(TIMESTAMP)/trivy.json . 2>/dev/null || echo "⚠️ Trivy no disponible"
	@echo "3️⃣ Ejecutando Semgrep..."
	@semgrep --config=p/security-audit --config=p/typescript --json -o .scan-results/$(TIMESTAMP)/semgrep.json src/ 2>/dev/null || echo "⚠️ Semgrep no disponible"
	@echo "✅ Escaneo completado en: .scan-results/$(TIMESTAMP)"

security-npm:
	@echo "🔍 Ejecutando auditoría NPM..."
	npm audit

security-npm-fix:
	@echo "🔧 Corrigiendo vulnerabilidades NPM..."
	npm audit fix --depth 5

security-trivy:
	@echo "🔍 Ejecutando análisis Trivy..."
	trivy fs --format sarif -o .scan-results/trivy-results.sarif .

security-semgrep:
	@echo "🔍 Ejecutando análisis Semgrep..."
	semgrep --config=p/security-audit --config=p/typescript src/

deps-check:
	@echo "📦 Verificando dependencias..."
	npm outdated || true

deps-update:
	@echo "⚠️ Actualizando dependencias..."
	npm update

git-hooks-setup:
	@chmod +x .githooks/pre-commit 2>/dev/null || true
	@git config core.hooksPath .githooks 2>/dev/null || true
	@echo "✅ Git hooks de seguridad configurados"

# ============================================================
# DOCKER TARGETS
# ============================================================

docker-up:
	docker-compose up -d bastionguard
	@echo "✅ Dev container started"

docker-down:
	docker-compose down
	@echo "✅ Dev container stopped"

docker-logs:
	docker-compose logs -f bastionguard

docker-shell:
	docker-compose exec bastionguard bash

docker-build:
	docker-compose build bastionguard

docker-build-secure:
	@echo "🔒 Construyendo imagen con análisis de seguridad..."
	docker build -f .devcontainer/Dockerfile -t $(DOCKER_IMAGE) .
	@echo "🔍 Escaneando imagen con Trivy..."
	trivy image --format json -o .scan-results/docker-image-scan.json $(DOCKER_IMAGE) || true
	@echo "✅ Imagen construida y escaneada"

# ============================================================
# SERVICES TARGETS
# ============================================================

services-up:
	docker-compose up -d
	@echo "✅ All services started (PostgreSQL, Redis, Prometheus)"

services-down:
	docker-compose down
	@echo "✅ All services stopped"

services-logs:
	docker-compose logs -f

services-status:
	docker-compose ps

# ============================================================
# WORKFLOW TARGETS
# ============================================================

setup: install build git-hooks-setup
	@echo "✅ Setup complete!"

ci: lint test security-npm
	@echo "✅ CI checks passed!"

pre-commit: lint format security-npm
	@echo "✅ Pre-commit checks passed!"

dev-all: docker-up dev
	@echo "✅ Running in full dev environment"

# CI/CD simulation
ci: clean install type-check lint build
	@echo "✅ CI checks passed!"

# Full clean
deep-clean: clean
	rm -rf node_modules package-lock.json
	docker-compose down -v
	@echo "✅ Deep clean complete!"
