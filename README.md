# BastionGuard 🛡️

> **DevSecOps security reference implementation** focused on shifting security left without losing delivery speed.

BastionGuard demonstrates how application security controls can be integrated into the developer workflow and CI/CD pipeline: source analysis, dependency security, secret detection, infrastructure scanning and container hardening.

## 🎯 Objective

Build a reproducible security baseline for modern software delivery where security is treated as an engineering control rather than a final manual audit.

## 🏗️ Security pipeline

```text
Developer
   │
   ▼
Pre-commit hooks
   │
   ├── Secret detection
   ├── Formatting / linting
   └── Type checks
   │
   ▼
CI/CD
   │
   ├── SAST ............ Semgrep / CodeQL
   ├── SCA ............. npm audit / dependency checks
   ├── Secrets ......... Gitleaks
   ├── IaC ............. Checkov
   └── Containers ...... Trivy / Grype
   │
   ▼
Security Gate
   │
   ├── PASS → Build / Deploy
   └── FAIL → Block + Remediate
```

## 🔐 Controls demonstrated

| Control | Purpose |
|---|---|
| **SAST** | Detect insecure code patterns early |
| **SCA** | Identify vulnerable dependencies |
| **Secret scanning** | Prevent credentials from reaching the repository |
| **IaC scanning** | Detect insecure infrastructure configuration |
| **Container scanning** | Detect vulnerable packages and images |
| **Least privilege** | Reduce runtime permissions |
| **No root** | Reduce container impact if compromised |
| **Read-only filesystem** | Limit post-exploitation modification |
| **No-new-privileges** | Prevent privilege escalation paths |
| **Capability reduction** | Minimize Linux kernel privileges |

## 🧰 Tooling

`Docker` · `GitHub Actions` · `Semgrep` · `Trivy` · `Gitleaks` · `Checkov` · `npm audit` · `Grype` · `Prometheus` · `Grafana`

## 📁 Repository areas

```text
.github/          CI/CD and security automation
.githooks/        Local developer security controls
docker/           Container-oriented configuration
.env.example      Safe environment variable template
DEVSECOPS.md      Security implementation notes
Makefile          Developer automation
```

## 🚀 Why this belongs in a DevSecOps portfolio

This project is intentionally more than a collection of security tools. It demonstrates the workflow required to make security **repeatable and enforceable**:

1. Establish security controls before code reaches the main branch.
2. Automate analysis in CI/CD.
3. Produce actionable findings.
4. Define security gates.
5. Harden runtime environments.
6. Document the threat model and remediation process.

## 📚 Documentation

- [`DEVSECOPS.md`](./DEVSECOPS.md) — security controls and implementation
- [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) — implementation roadmap
- [`MARKET_COMPETITIVENESS_ANALYSIS.md`](./MARKET_COMPETITIVENESS_ANALYSIS.md) — project positioning

## 🗺️ Portfolio roadmap

- [ ] Threat model with STRIDE
- [ ] Architecture diagram
- [ ] End-to-end GitHub Actions security pipeline
- [ ] SARIF security reporting
- [ ] SBOM generation with Syft
- [ ] Container image signing / verification
- [ ] Terraform security scanning
- [ ] Kubernetes admission/security controls
- [ ] Security metrics dashboard
- [ ] Documented attack → detection → remediation scenarios

## ⚠️ Scope

BastionGuard is a **security engineering and learning reference implementation**. Findings, controls and deployment assumptions should be validated against the requirements of each real environment before production adoption.

---

<div align="center">

**Secure the code. Secure the pipeline. Secure the runtime.**

</div>
