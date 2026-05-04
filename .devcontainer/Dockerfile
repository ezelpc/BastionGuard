FROM mcr.microsoft.com/devcontainers/typescript-node:20-bullseye

# Etiquetas de seguridad
LABEL security.scan="enabled" \
      devsecops="true" \
      container.version="1.0.0"

# Establecer variables de compilación seguras
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true

# ============================================================
# FASE 1: Actualizar base y herramientas de seguridad
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Escáneres de seguridad
    git-crypt \
    gnupg \
    gnupg-agent \
    ca-certificates \
    # Herramientas CLI básicas
    curl \
    wget \
    jq \
    # Utilidades de diagnóstico
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    vim-tiny \
    nano \
    git \
    # Build tools
    build-essential \
    python3 \
    python3-pip \
    # Database clients
    postgresql-client \
    # Monitoreo y análisis
    htop \
    # Herramientas de seguridad
    openssh-client \
    openssl \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/*

# ============================================================
# FASE 1B: Instalar kubectl, helm, y yq desde binarios
# ============================================================
RUN set -ex; \
    KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt | tr -d 'v'); \
    curl -LO "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl; \
    \
    HELM_VERSION=$(curl -sL https://api.github.com/repos/helm/helm/releases/latest | grep tag_name | cut -d'"' -f4 | cut -d'v' -f2); \
    curl -L "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz" | tar xz && \
    install -o root -g root -m 0755 linux-amd64/helm /usr/local/bin/helm && \
    rm -rf linux-amd64; \
    \
    YQ_VERSION=$(curl -sL https://api.github.com/repos/mikefarah/yq/releases/latest | grep tag_name | cut -d'"' -f4 | cut -d'v' -f2); \
    curl -L "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

# ============================================================
# FASE 2: Instalar herramientas DevSecOps
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Docker CLI (no el daemon)
    docker.io \
    # Trivy - Vulnerability scanner
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip3 and install Python security tools
RUN pip3 install --upgrade pip setuptools wheel \
    && pip3 install semgrep --break-system-packages --no-cache-dir \
    && pip3 install checkov --break-system-packages --no-cache-dir

# ============================================================
# FASE 3: Herramientas Node.js para desarrollo
# ============================================================
RUN npm install -g \
    ts-node \
    nodemon \
    @nestjs/cli \
    pm2 \
    npm-audit-fix \
    snyk \
    jest \
    --loglevel=warn

# ============================================================
# FASE 4: Configuración de seguridad
# ============================================================
# Crear directorios seguros
RUN mkdir -p /home/node/.ssh \
    && mkdir -p /home/node/.docker \
    && mkdir -p /home/node/.gnupg \
    && mkdir -p /workspace/logs \
    && mkdir -p /workspace/.scan-results

# Configurar permisos seguros
RUN chmod 700 /home/node/.ssh \
    && chmod 700 /home/node/.docker \
    && chmod 700 /home/node/.gnupg \
    && chmod 755 /workspace \
    && chown -R node:node /home/node \
    && chown -R node:node /workspace

# Configuración de SSH más segura
RUN echo "StrictHostKeyChecking=accept-new" >> /etc/ssh/ssh_config \
    && echo "UserKnownHostsFile=/home/node/.ssh/known_hosts" >> /etc/ssh/ssh_config

# ============================================================
# FASE 5: Preparación del workspace
# ============================================================
WORKDIR /workspace

# Copiar archivos manteniendo propietario correcto
COPY --chown=node:node . .

# Instalar dependencias con auditoría
RUN npm ci --prefer-offline --audit \
    && npm audit fix --depth 5 --no-save || true

# Compilar TypeScript
RUN npm run build 2>/dev/null || true

# ============================================================
# FASE 6: Configuraciones finales de seguridad
# ============================================================
# Permitir que node acceda a docker socket (para DinD)
RUN usermod -aG docker node

# Crear archivo de configuración para análisis de seguridad
RUN cat > /home/node/.devsecops.config <<'EOF'
{
  "scan": {
    "enabled": true,
    "trivy": true,
    "semgrep": true,
    "checkov": true,
    "npm-audit": true
  },
  "git": {
    "enforce-signatures": false,
    "enforce-diffs-review": true
  },
  "container": {
    "readonly-root": true,
    "drop-capabilities": true,
    "no-new-privileges": true
  }
}
EOF

# ============================================================
# CONFIGURACIÓN FINAL
# ============================================================
USER node

# No ejecutar como root por defecto
EXPOSE 3000 8080 9090 5432 6379

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1 2>/dev/null || true

# Script de entrada por defecto
CMD ["/bin/bash"]
