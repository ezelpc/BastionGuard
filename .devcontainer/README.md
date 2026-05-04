# Dev Container Setup Guide

## Quick Start

### Option 1: VS Code Dev Container (Recommended)

1. **Install Remote - Containers extension** in VS Code
2. **Open the project folder** in VS Code
3. **Press `Ctrl+Shift+P`** and search for "Dev Containers: Reopen in Container"
4. **Wait for setup** to complete (first time may take 2-3 minutes)
5. **Start developing** with full TypeScript support and all tools

### Option 2: Docker Compose

```bash
# Start the dev container with all services
make services-up

# Access the container
make docker-shell

# Or
docker-compose exec bastionguard bash
```

### Option 3: Local Development

```bash
# Install Node.js 20+ first

# Install dependencies
make install

# Run in development mode
make dev

# Or watch mode
make dev-watch
```

## What's Included

### Dev Container Features

- ✅ **Node.js 20** - Latest LTS version
- ✅ **TypeScript 6** - Full type support
- ✅ **Docker-in-Docker** - Run Docker commands from container
- ✅ **Kubernetes Tools** - kubectl, helm ready
- ✅ **VS Code Extensions** - Pre-configured for TypeScript development
- ✅ **Git Integration** - Full git support with GitLens

### Development Tools

- 🛠️ **ESLint** - Code quality checking
- 🛠️ **Prettier** - Code formatting
- 🛠️ **ts-node** - Run TypeScript directly
- 🛠️ **Nodemon** - Auto-reload on changes
- 🛠️ **TypeScript Compiler** - Full compilation support

### Optional Services (Docker Compose)

- 🗄️ **PostgreSQL 16** - Database for audit logs
- 🔴 **Redis 7** - Caching and job queues
- 📊 **Prometheus** - Metrics collection (with `--profile monitoring`)

## Environment Setup

### 1. Create `.env` from template

```bash
cp .env.example .env
```

### 2. Configure for development

Key settings in `.env`:

```env
NODE_ENV=development
DEBUG=bastionguard:*
DRY_RUN=true                  # Prevent actual execution
KUBECONFIG=/home/node/.kube/config
```

### 3. Mount Kubernetes config (if using K8s)

The dev container automatically mounts:

- `~/.kube` → `/home/node/.kube` (read-only)
- `~/.docker` → `/home/node/.docker` (read-only)
- `~/.ssh` → `/home/node/.ssh` (read-only)

## Common Commands

### Development

```bash
# Run with file watching and auto-reload
make dev-watch

# Build TypeScript
make build

# Build with watching
make build-watch

# Run tests
make test
```

### Code Quality

```bash
# Check code quality
make lint

# Fix linting issues
make lint-fix

# Format code
make format

# Type checking
make type-check
```

### Docker

```bash
# Start just the dev container
make docker-up

# Start all services (including PostgreSQL, Redis)
make services-up

# View logs
make docker-logs

# Access shell
make docker-shell

# Stop everything
make docker-down
```

### Utility

```bash
# Full setup (clean install + build)
make setup

# Development environment (services + dev server)
make dev-all

# CI simulation (what runs in GitHub Actions)
make ci

# Deep clean (remove node_modules, volumes)
make deep-clean
```

## Debugging in VS Code

### Debug Configuration

Pre-configured debug configurations in `.vscode/launch.json`:

1. **Debug test-executor** - Debug the main test file with breakpoints
2. **Attach to Process** - Attach to running Node.js process

### How to Debug

1. Open [src/test-executor.ts](../src/test-executor.ts)
2. Click on line numbers to add breakpoints
3. Press `F5` or click "Run and Debug" → "Debug test-executor"
4. Step through code with F10, F11
5. Inspect variables in the Debug panel

## Advanced Setup

### Add new npm packages

```bash
npm install package-name

# Or in container
docker-compose exec bastionguard npm install package-name
```

### Update TypeScript

TypeScript is configured in `tsconfig.json`:

- Target: ES2020
- Strict mode enabled
- Path aliases configured (`@core/*`, `@providers/*`, etc.)

### Kubernetes Integration

If you have a local Kubernetes cluster (Docker Desktop, Minikube):

```bash
# Inside dev container
kubectl get pods
kubectl apply -f config.yaml
```

### Database Access

PostgreSQL runs on `localhost:5432`:

```bash
# Inside dev container
psql -h postgres -U bastionguard -d bastionguard_dev

# SQL queries
\dt                    # List tables
\q                     # Quit
```

### Redis Access

Redis runs on `localhost:6379`:

```bash
# Inside dev container
redis-cli
PING                   # Should return PONG
```

## Troubleshooting

### Dev container won't start

1. **Clear Docker cache**:

   ```bash
   docker system prune -a
   docker volume prune
   ```

2. **Rebuild container**:

   ```bash
   docker-compose build --no-cache bastionguard
   ```

3. **Check logs**:
   ```bash
   docker-compose logs bastionguard
   ```

### TypeScript errors after updating

```bash
# Clear TypeScript cache
rm -rf dist node_modules/.cache

# Rebuild
npm run build
```

### Port conflicts

If ports are already in use, edit `docker-compose.yml`:

```yaml
services:
  bastionguard:
    ports:
      - "3001:3000" # Changed from 3000:3000
```

### Slow performance

1. **Exclude node_modules from monitoring** - Already configured
2. **Use `.dockerignore`** - Already configured
3. **Check disk space**: `docker system df`

### Memory issues in container

Edit `docker-compose.yml`:

```yaml
services:
  bastionguard:
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
```

## Best Practices

1. **Always use dev container for consistency** across the team
2. **Keep `.env` local-specific** and never commit it
3. **Use `npm run format`** before committing
4. **Run `make lint`** to catch issues early
5. **Test in `DRY_RUN=true`** before enabling execution
6. **Check logs** for debugging: `docker-compose logs`

## IDE Configuration

### VS Code Settings

Auto-configured in `.vscode/settings.json`:

- Prettier for formatting on save
- ESLint for linting on save
- TypeScript strict mode
- Inlay hints for types
- File auto-save after 1 second

### Recommended Additional Extensions

- GitLens - Git history visualization
- REST Client - Test API endpoints
- YAML - YAML file support
- MongoDB - If using MongoDB

## Integration with CI/CD

The same tools that run locally also run in CI:

```bash
# Simulate CI pipeline
make ci
```

This runs type checking, linting, and builds — just like GitHub Actions.

## File Structure

```
.devcontainer/
├── devcontainer.json      # VS Code dev container config
├── Dockerfile             # Container image definition
└── post-create-command.sh # Setup script

.vscode/
├── launch.json           # Debug configurations
├── settings.json         # IDE settings
└── extensions.json       # Recommended extensions

monitoring/
└── prometheus.yml        # Prometheus config

.env.example              # Environment template
.eslintrc.json           # ESLint configuration
.prettierrc.json         # Prettier configuration
tsconfig.json            # TypeScript configuration
Makefile                 # Development commands
docker-compose.yml       # Multi-service setup
```

## Getting Help

1. Check existing logs: `docker-compose logs`
2. See available commands: `make help`
3. Check README.md for project overview
4. Review error messages in VS Code Problems panel

---

Happy coding! 🚀
