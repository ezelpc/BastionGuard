#!/bin/bash

# ============================================================
# BastionGuard Setup Script
# ============================================================
# Usage: bash scripts/setup.sh
# 
# This script initializes the BastionGuard development environment:
# - Generates JWT secret
# - Creates .env file
# - Sets up data directories
# - Installs dependencies
# ============================================================

set -e

echo "🛡️  BastionGuard Development Setup"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Check if Node.js is installed
echo -e "${BLUE}[1/6]${NC} Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 20.0.0"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node --version) found"

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm $(npm --version) found"

# 2. Generate JWT secret
echo -e "${BLUE}[2/6]${NC} Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}✓${NC} JWT secret generated"

# 3. Create .env file
echo -e "${BLUE}[3/6]${NC} Creating .env file..."
if [ -f .env ]; then
    echo -e "${YELLOW}⚠${NC}  .env already exists, backing up to .env.backup"
    cp .env .env.backup
fi

cp .env.example .env

# Update JWT secret in .env
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|change-this-to-a-strong-random-secret-in-production|$JWT_SECRET|" .env
else
    # Linux
    sed -i "s|change-this-to-a-strong-random-secret-in-production|$JWT_SECRET|" .env
fi

echo -e "${GREEN}✓${NC} .env file created"
echo -e "   ${YELLOW}⚠${NC}  Remember to update API keys in .env:"
echo "      - ANTHROPIC_API_KEY"
echo "      - DATABASE_URL (if using remote)"
echo "      - SLACK_WEBHOOK_URL"
echo "      - Other integrations"

# 4. Create directories
echo -e "${BLUE}[4/6]${NC} Creating directories..."
mkdir -p data logs .scan-results node_modules/.bin
echo -e "${GREEN}✓${NC} Directories created"

# 5. Install dependencies
echo -e "${BLUE}[5/6]${NC} Installing npm dependencies..."
npm install
echo -e "${GREEN}✓${NC} Dependencies installed"

# 6. Type checking
echo -e "${BLUE}[6/6]${NC} Running type check..."
npm run type-check
echo -e "${GREEN}✓${NC} Type check passed"

echo ""
echo "============================================================"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Update .env with your API keys and credentials"
echo "  2. Configure tenants in src/config/tenants.yml"
echo "  3. Start services: docker compose up -d"
echo "  4. Run development server: npm run dev"
echo ""
echo "Useful commands:"
echo "  npm run dev              - Start dev server"
echo "  npm run dev:watch        - Start with auto-reload"
echo "  npm run demo             - Run interactive demo"
echo "  npm run test             - Run test suite"
echo "  npm run lint             - Check code quality"
echo "  make help                - Show all available commands"
echo ""
echo "Documentation:"
echo "  - README.md              - Project overview"
echo "  - DEVSECOPS.md           - Security setup"
echo "  - docs/                  - Full documentation"
echo ""
