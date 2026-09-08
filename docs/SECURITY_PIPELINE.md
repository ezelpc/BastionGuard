# BastionGuard Security Pipeline

BastionGuard is presented as a practical Secure SDLC / DevSecOps laboratory. The pipeline is designed to demonstrate how security controls become engineering gates instead of manual checks performed after deployment.

## Pipeline

```text
Developer change
      |
      v
  Pull Request
      |
      +--> Secret Scan (Gitleaks)
      |
      +--> SAST (Semgrep)
      |
      +--> SCA (npm audit)
      |
      +--> Filesystem CVE Scan (Trivy)
      |
      +--> Type Check / Lint / Tests
      |
      v
 Security Gate
      |
      v
  Build Artifact
      |
      v
Container Image Scan
      |
      v
    Deploy
```

## Control objectives

| Control | Objective | Current implementation |
|---|---|---|
| Secret scanning | Prevent credentials from entering source control | Gitleaks |
| SAST | Detect insecure code patterns early | Semgrep |
| SCA | Identify vulnerable dependencies | npm audit |
| Vulnerability management | Detect vulnerable files and artifacts | Trivy |
| Quality gates | Reduce regressions | TypeScript, lint, tests, coverage |
| Container security | Scan built images before release | Makefile / Trivy |
| Least privilege | Reduce CI permissions | `contents: read` |

## Fail-closed philosophy

A security gate should fail the pipeline when a high-risk finding violates project policy. Suppressing failures with `|| true` is appropriate only for intentionally advisory local experiments; release CI should use explicit thresholds and documented exceptions.

## Evidence

Recommended evidence for a security review:

- GitHub Actions run results
- Gitleaks findings or clean scan
- Semgrep findings and remediation commits
- npm audit results
- Trivy filesystem and image reports
- Test and coverage reports
- SBOM generated for releasable images

## Exception handling

Security exceptions must be explicit, time-bounded, documented, and tied to a reason. Never suppress a finding simply to make a pipeline green.

## Portfolio demonstration scenarios

1. Introduce a deliberately vulnerable dependency and observe SCA failure.
2. Add a test secret and observe Gitleaks failure.
3. Introduce an insecure code pattern and observe Semgrep failure.
4. Add a vulnerable base image and observe Trivy failure.
5. Fix the issue and demonstrate the pipeline returning to green.

All scenarios should use synthetic data and authorized environments only.
