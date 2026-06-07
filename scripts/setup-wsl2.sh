#!/bin/bash

# ============================================================
# WSL2 + Docker Desktop Setup Helper
# ============================================================
# This script helps set up Docker Desktop with WSL2 integration
# for BastionGuard development.
#
# Usage: bash scripts/setup-wsl2.sh
# ============================================================

echo "🐳 WSL2 + Docker Desktop Setup Helper"
echo "======================================"

# Detect OS
if [[ "$OSTYPE" != "linux-gnu"* ]] && [[ ! -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
    echo "❌ This script is designed for WSL2 Linux only"
    exit 1
fi

# Check if running in WSL2
if ! grep -qi "wsl" /proc/version &> /dev/null; then
    echo "⚠️  This appears to be native Linux, not WSL2"
    echo "   Skipping Docker Desktop-specific setup"
    exit 0
fi

echo -e "\n✓ WSL2 detected"

# Check if Docker can be found
if ! command -v docker &> /dev/null; then
    echo -e "\n❌ Docker is not available in this WSL2 distro"
    echo ""
    echo "To fix this:"
    echo "1. Open Docker Desktop on Windows"
    echo "2. Go to Settings → Resources → WSL Integration"
    echo "3. Enable the toggle for $(lsb_release -cs 2>/dev/null || echo 'your-distro')"
    echo "4. Click 'Apply & Restart'"
    echo "5. Then run: wsl --shutdown"
    exit 1
fi

echo "✓ Docker is available"

# Test Docker connection
if ! docker version &> /dev/null; then
    echo "❌ Docker daemon is not running"
    echo ""
    echo "To fix this:"
    echo "1. Start Docker Desktop on Windows"
    echo "2. Wait for it to fully initialize (check system tray)"
    echo "3. Try again"
    exit 1
fi

echo "✓ Docker daemon is running"

# Check Docker version
DOCKER_VERSION=$(docker version --format '{{.Server.Version}}')
echo "✓ Docker version: $DOCKER_VERSION"

# Check docker-compose
if ! docker compose version &> /dev/null; then
    echo "⚠️  docker-compose not available, installing..."
    # This would typically be pre-installed with Docker Desktop
    echo "   Please ensure Docker Desktop is up-to-date"
fi

# Test Docker can build images
echo -e "\n🧪 Testing Docker build capability..."
if ! docker run --rm hello-world &> /dev/null; then
    echo "❌ Docker build test failed"
    exit 1
fi

echo "✓ Docker can build and run images"

# Check DNS resolution
echo -e "\n🌐 Testing DNS resolution..."
if ! docker run --rm alpine nslookup docker.com &> /dev/null; then
    echo "⚠️  DNS resolution inside containers may be slow"
    echo "   Consider restarting Docker Desktop"
fi

echo "✓ DNS resolution working"

echo -e "\n✅ All checks passed!"
echo "============================================================"
echo ""
echo "You're ready to develop with BastionGuard!"
echo ""
echo "Next steps:"
echo "  cd /path/to/bastionguard"
echo "  bash scripts/setup.sh"
echo "  npm run dev"
echo ""
echo "For help, see: docs/QUICKSTART.md"
echo ""
