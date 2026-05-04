# BastionGuard 🛡️

Secure infrastructure action executor with AI-powered safeguards for Kubernetes, ECS, and Docker Swarm.

## Features

- ✅ **Safe Action Execution** - Allowlist-based action validation
- ✅ **Multi-Provider Support** - Kubernetes, ECS, Docker Swarm
- ✅ **Guardrails** - Prevent destructive operations (delete, drop, remove, etc.)
- ✅ **Dry-Run Mode** - Test actions safely before execution
- ✅ **Audit Logging** - Complete action tracking and history
- ✅ **AI-Safe** - Designed for AI agent integration

## Development Setup

### Using VS Code Dev Container

1. Install [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Press `Ctrl+Shift+P` and select "Dev Containers: Reopen in Container"
3. Wait for setup to complete

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Or just the main service
docker-compose up -d bastionguard

# Access the container
docker-compose exec bastionguard bash
```

### Local Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run in development mode
npm run dev

# Watch mode with auto-reload
npm run dev:watch
```

## Available Commands

```bash
npm run dev              # Run test executor
npm run dev:watch       # Run with file watching
npm run build           # Compile TypeScript
npm run build:watch     # Compile with watching
npm run lint            # Check code quality
npm run lint:fix        # Fix linting issues
npm run format          # Format code with Prettier
npm run type-check      # Run TypeScript type checking
npm run clean           # Clean build artifacts
```

## Project Structure

```
src/
├── core/
│   ├── action-executor/    # Main execution engine
│   ├── ai-agent/           # AI integration
│   ├── alert-receiver/     # Alert handling
│   ├── diagnostic-engine/  # System diagnostics
│   └── escalation/         # Escalation logic
├── providers/
│   ├── kubernetes/         # K8s provider
│   ├── ecs/                # AWS ECS provider
│   └── docker-swarm/       # Docker Swarm provider
└── config/
    └── tenant.yml          # Tenant configuration
```

## Testing

```bash
# Run a test execution
npm run dev

# Test specific scenarios
ts-node src/test-executor.ts
```

## Docker & Kubernetes

The dev container includes:

- ✅ Docker CLI and Docker-in-Docker support
- ✅ kubectl for Kubernetes interaction
- ✅ Helm for package management
- ✅ Docker Compose for local services

Mount your kubeconfig and docker config:

```bash
docker-compose exec -it bastionguard bash
kubectl get pods
docker ps
```

## Configuration

Copy and customize `.env.example`:

```bash
cp .env.example .env
```

Key settings:

- `NODE_ENV` - Set to `development` for dev container
- `DRY_RUN` - Set to `true` to prevent actual execution
- `DEBUG` - Enable debug logging: `bastionguard:*`

## Database & Cache (Optional)

The docker-compose includes optional services:

- **PostgreSQL** - For audit logs and persistence
- **Redis** - For caching and queues
- **Prometheus** - For metrics (with `--profile monitoring`)

```bash
# Start with monitoring
docker-compose --profile monitoring up -d

# View services
docker-compose ps
```

## IDE Configuration

VS Code is pre-configured with:

- TypeScript support
- ESLint and Prettier
- Kubernetes tools
- REST client
- YAML support
- Resource monitor

Settings are in `.vscode/settings.json` (created in container).

## Contributing

1. Follow code style (auto-formatted with Prettier)
2. Add type annotations
3. Run linting: `npm run lint:fix`
4. Test with `npm run dev`

## Security Notes

- 🔒 `DRY_RUN=true` by default - explicitly enable for production
- 🔒 Action allowlist prevents unauthorized operations
- 🔒 Forbidden keyword detection blocks destructive actions
- 🔒 All actions are audited and logged

## License

ISC

## Support

For issues, create an issue in the repository.
