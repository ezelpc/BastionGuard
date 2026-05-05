FROM mcr.microsoft.com/devcontainers/typescript-node:20-bullseye

LABEL security.scan="enabled" \
      devsecops="true" \
      container.version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true

# ============================================================
# FASE 1: Paquetes base y herramientas CLI
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    git-crypt \
    gnupg \
    gnupg-agent \
    ca-certificates \
    curl \
    wget \
    jq \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    vim-tiny \
    nano \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    postgresql-client \
    htop \
    openssh-client \
    openssl \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# ============================================================
# FASE 2: kubectl y helm
# ============================================================
RUN set -ex; \
    KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt | tr -d 'v'); \
    curl -LO "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl; \
    \
    HELM_VERSION=$(curl -sL https://api.github.com/repos/helm/helm/releases/latest \
      | grep tag_name | cut -d'"' -f4 | cut -d'v' -f2); \
    curl -L "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz" | tar xz && \
    install -o root -g root -m 0755 linux-amd64/helm /usr/local/bin/helm && \
    rm -rf linux-amd64

# ============================================================
# FASE 3: Docker CLI + Trivy
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends docker.io \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
       | sh -s -- -b /usr/local/bin \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# FASE 4: Herramientas Python en virtualenv
# (bullseye tiene pip antiguo que no soporta --break-system-packages)
# ============================================================
RUN python3 -m venv /opt/security-tools \
    && /opt/security-tools/bin/pip install --upgrade pip setuptools wheel \
    && /opt/security-tools/bin/pip install semgrep --no-cache-dir \
    && /opt/security-tools/bin/pip install checkov --no-cache-dir

ENV PATH="/opt/security-tools/bin:$PATH"

# ============================================================
# FASE 5: Herramientas Node.js globales
# ============================================================
RUN npm install -g --loglevel=warn \
    ts-node \
    nodemon

# ============================================================
# FASE 6: Directorios y permisos
# ============================================================
RUN mkdir -p /home/node/.ssh \
    && mkdir -p /home/node/.docker \
    && mkdir -p /home/node/.gnupg \
    && mkdir -p /workspace/logs \
    && mkdir -p /workspace/.scan-results \
    && chmod 700 /home/node/.ssh \
    && chmod 700 /home/node/.docker \
    && chmod 700 /home/node/.gnupg \
    && chmod 755 /workspace \
    && chown -R node:node /home/node \
    && chown -R node:node /workspace \
    && chown -R node:node /opt/security-tools

RUN usermod -aG docker node

# ============================================================
# NOTA: npm install se hace en postCreateCommand, NO aquí
# El código fuente se monta como volumen en runtime
# ============================================================

USER node
WORKDIR /workspace

EXPOSE 3000 8080 9090

CMD ["/bin/bash"]