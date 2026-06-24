# Security Tooling

This folder holds configuration for every security tool wired into the
DevSecOps pipeline for this project. Each tool maps to a stage of the
software delivery lifecycle so that security is "shifted left" (caught
before merge) as well as enforced at runtime ("shifted right").

## Pipeline stage to tool mapping

Static code analysis (SAST) is handled by ESLint security-relevant rules
plus GitHub CodeQL, which runs on every pull request and scans the
JavaScript/Node.js source for common vulnerability patterns such as
injection, unsafe regular expressions, and prototype pollution.

Software composition analysis (SCA), i.e. scanning third-party
dependencies for known CVEs, is handled by `npm audit` in CI and by
Trivy's filesystem scanner (`trivy fs .`), configured in `trivy/trivy.yaml`.
Both fail the pipeline on CRITICAL/HIGH findings.

Secret scanning is handled by Gitleaks (`gitleaks.toml`), which runs on
every push and pull request to catch committed credentials, API keys, and
private keys before they reach version history permanently.

Infrastructure-as-code scanning is handled by Checkov (`.checkov.yaml`),
which inspects the Dockerfiles and Kubernetes manifests in this repository
for misconfigurations: containers running as root, missing resource
limits, missing securityContext, and similar issues.

Container image scanning is handled by Trivy's image scanner
(`trivy image <ecr-image-uri>`), run in CI immediately after each image is
built and again as a gate before ArgoCD is allowed to sync a new image tag
into the cluster.

Dynamic application security testing (DAST) is handled by OWASP ZAP's
baseline scanner (`zap/zap-rules.tsv`), which crawls and actively tests the
running application (typically against a staging URL) for common web
vulnerabilities (XSS, injection, missing security headers) after every
deployment to a non-production namespace.

Runtime admission control inside the Kubernetes cluster is handled by
Kyverno (`kyverno/kyverno-policies.yaml`), which enforces non-root
containers, dropped Linux capabilities, mandatory resource limits, and
disallows the `:latest` image tag — independent of whatever CI already
checked, so a misconfigured manifest can never be scheduled even if it
slips past earlier gates. Kubernetes' built-in Pod Security Admission
controller additionally enforces the "restricted" Pod Security Standard
on the `crud-app` namespace (see `k8s/base/namespace.yaml`).

Network-level isolation inside the cluster is handled by the
`NetworkPolicy` resources in `k8s/base/network-policy.yaml`, which default-deny
all pod-to-pod traffic and then explicitly allow only frontend-to-backend
and backend-to-postgres communication.

## Where each tool plugs into CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`) runs ESLint, CodeQL,
`npm audit`, Gitleaks, Checkov, the Jest test suite, and Trivy's filesystem
scan on every pull request as a fast feedback loop.

Jenkins (`jenkins/Jenkinsfile`) runs the heavier, slower stages after a
merge to `main`: building and scanning the Docker images with Trivy, pushing
to ECR only if the scan passes, then triggering the ArgoCD sync. OWASP ZAP
runs against the resulting staging deployment as the final gate before a
manual promotion to production.

## Why both Trivy and Checkov

Trivy and Checkov overlap somewhat but specialize differently: Trivy is
strongest at vulnerability databases (CVEs in OS packages and language
dependencies) and at scanning built container images, while Checkov is
strongest at structural misconfiguration analysis (does this Kubernetes
manifest define a securityContext, does this Dockerfile use a pinned base
image, etc.). Running both gives broader coverage than either alone.
