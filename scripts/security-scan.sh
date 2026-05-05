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
