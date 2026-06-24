# 3-Tier CRUD Application with Full DevSecOps Pipeline

A deliberately simple inventory CRUD application, built specifically as a
study project for learning DevSecOps end to end: a real three-tier
architecture (frontend, backend, database) behind a load balancer,
containerized with Docker, deployed to Kubernetes on AWS EKS, built and
pushed through a CI/CD pipeline that combines GitHub Actions and Jenkins,
deployed via GitOps with ArgoCD, and scanned by a stack of security tools
at every stage. Nothing here is over-engineered for its own sake — every
piece exists so you have something concrete to point at while learning
the corresponding DevSecOps concept.

## Table of contents

1. Application architecture
2. What each file and folder does
3. Running the project locally with Docker Compose
4. Running the project on AWS EKS
5. CI/CD pipeline architecture
6. Security tooling (DevSecOps) overview
7. Estimated AWS cost for a 3-hour study session

## 1. Application architecture

The application is a plain inventory manager: create, read, update, and
delete "items" that each have a name, description, and quantity. The
interesting part isn't the business logic, it's the architecture around it.

Tier one is the frontend: a small vanilla HTML/CSS/JavaScript single page,
served by its own Nginx container. It calls the backend exclusively
through a relative `/api/...` path, so it never needs to know the
backend's hostname or how many backend replicas exist.

Tier two is the backend: a Node.js/Express REST API exposing standard CRUD
endpoints under `/api/items`. It validates all input with
`express-validator`, talks to PostgreSQL exclusively through parameterized
queries (no string-concatenated SQL anywhere), and is hardened with
`helmet` (secure HTTP headers), CORS allowlisting, and request rate
limiting.

Tier three is the database: PostgreSQL, accessed by a dedicated
least-privilege `appuser` role that can only read/write the `items` table,
never the database's superuser account.

In front of tiers one and two sits a load balancer. Locally (Docker
Compose) this is a standalone Nginx container performing round-robin load
balancing across however many frontend/backend replicas you scale up. On
AWS/EKS this role is taken over by an actual AWS Application Load Balancer,
provisioned automatically by the AWS Load Balancer Controller reading the
Kubernetes `Ingress` resource in `k8s/base/ingress.yaml`.

Here is the full request path in production on EKS:

```
Internet
  -> AWS Application Load Balancer (provisioned by Ingress + AWS LB Controller)
    -> Kubernetes Service: frontend (ClusterIP, load balances across frontend Pods)
    -> Kubernetes Service: backend  (ClusterIP, load balances across backend Pods)
       -> PostgreSQL (StatefulSet, single primary, persistent volume)
```

And locally with Docker Compose:

```
http://localhost:8080
  -> nginx load balancer container (round-robin across replicas)
    -> frontend container(s) (Nginx serving static files)
    -> backend container(s) (Node/Express)
       -> postgres container (single instance)
```

## 2. What each file and folder does

### Root files

`docker-compose.yml` defines the full local stack: PostgreSQL, the backend
API, the static frontend, and the Nginx load balancer in front of them,
wired together on a single Docker network. `docker-compose.test.yml` spins
up a throwaway PostgreSQL container used only for running the backend's
Jest test suite outside of the full stack. `.env.example` is the template
for the environment variables Docker Compose needs (database passwords);
copy it to `.env` before running `docker compose up`. `.gitignore` keeps
`node_modules`, `.env`, and other local artifacts out of version control.

### `backend/`

`backend/src/server.js` is the process entrypoint: it connects to
PostgreSQL, then starts the Express HTTP server. `backend/src/app.js`
configures the Express app itself — security middleware (`helmet`, CORS,
rate limiting), JSON body parsing with a size limit, request logging, the
`/health` and `/ready` endpoints used by container/Kubernetes health
checks, and the centralized error handler that never leaks stack traces to
clients. `backend/src/db/pool.js` creates and exports a PostgreSQL
connection pool (via the `pg` library), with a `connectDB()` helper used
at startup to fail fast if the database is unreachable.
`backend/src/models/itemModel.js` is the data-access layer: every single
SQL query here uses parameterized placeholders (`$1`, `$2`, ...), which is
the primary defense against SQL injection in this codebase.
`backend/src/routes/items.js` defines the five CRUD HTTP endpoints and
validates every request body/parameter with `express-validator` before it
ever reaches the data layer. `backend/__tests__/items.test.js` is an
integration test suite (Jest + Supertest) that exercises the full CRUD
flow against a real PostgreSQL instance — there's no good in-memory
Postgres for Node the way there is for MongoDB, so tests run against
either a local throwaway container or a CI service container.
`backend/Dockerfile` builds a small, non-root, multi-stage production
image. `backend/.eslintrc.js` configures linting; `backend/.env.example`
documents the environment variables the backend expects.

### `frontend/`

`frontend/public/index.html`, `app.js`, and `styles.css` make up the
entire single-page app: a form to create/edit items and a table listing
them, talking to the backend only via relative `/api/...` calls.
`frontend/nginx.conf` is the Nginx configuration baked into the frontend's
own container — it serves the static files and proxies `/api/*` through to
the backend Service. `frontend/Dockerfile` builds this into a small,
non-root Nginx image.

### `nginx/`

This is the standalone edge load balancer used only in the Docker Compose
(local) setup. `nginx/nginx.conf` defines upstream blocks for the
frontend and backend and round-robins requests across however many
replicas you've scaled each service to. `nginx/Dockerfile` packages it.
In the Kubernetes/EKS deployment, this role is replaced entirely by the
`Ingress` resource and the AWS Application Load Balancer it provisions —
the `nginx/` folder is not used in the cloud deployment, only locally.

### `postgres-init/`

`postgres-init/init.sql` runs automatically the first time the Postgres
container starts in Docker Compose. It creates the `items` table, a
trigger to keep `updated_at` current, and the least-privilege `appuser`
role the backend actually connects as.

### `k8s/`

`k8s/base/namespace.yaml` creates the `crud-app` namespace and labels it
to enforce Kubernetes' built-in "restricted" Pod Security Standard.
`k8s/base/postgres-secret.yaml` is a **template** for the database
credentials Secret — the placeholder values must be replaced (ideally via
AWS Secrets Manager + External Secrets Operator, or at minimum `kubectl
create secret` at deploy time) and the real values should never be
committed to git. `k8s/base/postgres-statefulset.yaml` defines PostgreSQL
as a StatefulSet with a persistent volume claim, a ConfigMap holding the
same initialization SQL as the Docker Compose setup, and a headless
Service for stable network identity. `k8s/base/backend-deployment.yaml`
and `k8s/base/frontend-deployment.yaml` define the backend and frontend as
Deployments (2 replicas each by default) with resource requests/limits,
liveness/readiness probes, and a hardened `securityContext` (non-root,
all Linux capabilities dropped, no privilege escalation); the backend
Deployment also includes a `HorizontalPodAutoscaler` that scales it 2-6
replicas on CPU load. `k8s/base/ingress.yaml` is the resource the AWS
Load Balancer Controller watches to provision the real AWS ALB.
`k8s/base/network-policy.yaml` implements zero-trust networking inside
the cluster: a default-deny-all-ingress policy, then explicit allow rules
for frontend-to-backend and backend-to-postgres traffic only.
`k8s/base/kustomization.yaml` groups all of the above into one unit.
`k8s/overlays/dev/kustomization.yaml` is a smaller-footprint variant
(lower replica counts) intended for short study sessions, referenced from
the base.

### `argocd/`

`argocd/application.yaml` is the ArgoCD `Application` resource that
continuously syncs the live EKS cluster state to match what's declared in
`k8s/base` in this git repository — this is the GitOps mechanism described
in the CI/CD section below. `argocd/project.yaml` is an `AppProject` that
scopes exactly which repo, namespace, and resource kinds the Application
is allowed to touch, so a misconfigured manifest can't deploy arbitrary
cluster-wide resources.

### `.github/workflows/` and `jenkins/`

`.github/workflows/ci-cd.yml` is the GitHub Actions workflow that runs on
every pull request and push: linting, the backend test suite, dependency
auditing, secret scanning, IaC scanning, CodeQL static analysis, and a
Trivy scan of both the filesystem and the built container images.
`jenkins/Jenkinsfile` is the pipeline that runs after code lands on
`main`: it builds the production images, runs one more Trivy scan as a
final gate, pushes to ECR, commits the new image tag back into the
`k8s/base` manifests for ArgoCD to pick up, and finally runs an OWASP ZAP
dynamic scan against the resulting staging deployment. `jenkins/README.md`
documents the Jenkins credentials and plugins this pipeline assumes.

### `security/`

Holds the configuration for every security tool referenced above:
`security/trivy/` (image and filesystem vulnerability scanning),
`security/gitleaks.toml` (secret scanning), `security/.checkov.yaml` (IaC
misconfiguration scanning), `security/zap/` (dynamic application security
testing rules), and `security/kyverno/kyverno-policies.yaml` (Kubernetes
admission-control policies enforced at runtime inside the cluster).
`security/README.md` explains how each tool maps to a pipeline stage.

## 3. Running the project locally with Docker Compose

This is the fastest way to see the whole three-tier architecture running,
and it costs nothing since it runs entirely on your own machine.

```bash
cp .env.example .env
# edit .env if you want non-default passwords
docker compose up --build
```

Once it's up, open `http://localhost:8080` in a browser. To see the load
balancer actually distributing requests across multiple replicas, scale
the backend and frontend up before bringing the stack up:

```bash
docker compose up --build --scale backend=3 --scale frontend=2
```

To run the backend's test suite without the full stack:

```bash
docker compose -f docker-compose.test.yml up -d
cd backend && npm install && npm test
docker compose -f docker-compose.test.yml down -v
```

## 4. Running the project on AWS EKS

This section assumes you already have an EKS cluster, an ECR repository
for each image, and the AWS Load Balancer Controller and ArgoCD installed
in the cluster — setting those up is itself a learning exercise covered by
section 7's cost estimate below, since spinning up EKS is the bulk of the
cost.

Build and push the images to ECR (Jenkins automates this in the real
pipeline, but here's the manual equivalent):

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

docker build -t <account-id>.dkr.ecr.<region>.amazonaws.com/crud-backend:v1 -f backend/Dockerfile backend
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/crud-backend:v1

docker build -t <account-id>.dkr.ecr.<region>.amazonaws.com/crud-frontend:v1 -f frontend/Dockerfile frontend
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/crud-frontend:v1
```

Update the `image:` fields in `k8s/base/backend-deployment.yaml` and
`k8s/base/frontend-deployment.yaml` to point at your ECR registry and tag,
then either apply directly for a quick manual test:

```bash
kubectl apply -k k8s/base
```

or, for the full GitOps flow this project is built around, push that
change to git and let ArgoCD do it:

```bash
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application.yaml
# ArgoCD will now continuously sync k8s/base from your git repo
```

Get the ALB's public URL once the Ingress is provisioned:

```bash
kubectl get ingress -n crud-app
```

## 5. CI/CD pipeline architecture

```
Developer pushes code
        |
        v
Pull Request opened
        |
        v
+-------------------------------------------------------------+
|  GitHub Actions (.github/workflows/ci-cd.yml)               |
|  - ESLint                                                    |
|  - Jest tests (against a Postgres service container)         |
|  - npm audit (dependency CVEs)                               |
|  - Gitleaks (secret scanning)                                 |
|  - Checkov (IaC misconfiguration scanning)                    |
|  - CodeQL (static application security testing)               |
|  - Trivy filesystem scan + image scan                          |
+-------------------------------------------------------------+
        |  (all checks must pass)
        v
Merge to main
        |
        v
+-------------------------------------------------------------+
|  Jenkins (jenkins/Jenkinsfile)                                |
|  - Build backend + frontend Docker images                     |
|  - Trivy image scan (final gate before ECR push)              |
|  - Push images to Amazon ECR                                   |
|  - Commit new image tag into k8s/base manifests                |
|  - Run OWASP ZAP baseline scan against staging                  |
+-------------------------------------------------------------+
        |  (git commit with new image tag)
        v
+-------------------------------------------------------------+
|  ArgoCD (argocd/application.yaml)                              |
|  - Detects the new commit in k8s/base                          |
|  - Syncs the live EKS cluster state to match git               |
|  - selfHeal: true means manual kubectl drift gets reverted      |
+-------------------------------------------------------------+
        |
        v
+-------------------------------------------------------------+
|  EKS Cluster                                                  |
|  - Kyverno admission policies validate every pod spec          |
|  - NetworkPolicies enforce zero-trust pod-to-pod traffic        |
|  - AWS Load Balancer Controller provisions/updates the ALB      |
+-------------------------------------------------------------+
```

The deliberate split between GitHub Actions and Jenkins mirrors a common
real-world pattern: GitHub Actions gives fast, cheap, parallel feedback
directly on pull requests, while Jenkins handles the heavier orchestration
(image builds, registry credentials, GitOps commits) that benefits from a
persistent, more configurable controller. ArgoCD then closes the loop with
GitOps: nothing is ever deployed by a human or a CI job running `kubectl
apply` directly against production — the only path to the cluster is a git
commit that ArgoCD reconciles, which gives you a complete, auditable
history of every change that ever reached the cluster, plus an easy
rollback path through `git revert`.

## 6. Security tooling (DevSecOps) overview

Every stage of the pipeline above has a corresponding security control,
summarized here (see `security/README.md` for the full detail on each tool):

Static analysis and dependency scanning happen before code ever merges:
ESLint and CodeQL scan the source code itself, `npm audit` and Trivy's
filesystem scanner check third-party dependencies for known CVEs, Gitleaks
catches accidentally committed secrets, and Checkov inspects the
Dockerfiles and Kubernetes manifests for structural misconfigurations like
missing resource limits or containers that would run as root.

Container image scanning happens twice: once in GitHub Actions right after
each image is built (fast feedback on a PR), and again in Jenkins
immediately before any image is pushed to ECR (the actual release gate —
nothing reaches the registry if Trivy finds a CRITICAL or HIGH
vulnerability).

Dynamic testing happens after deployment: OWASP ZAP's baseline scanner
crawls and actively probes the running staging application for common web
vulnerabilities, which catches issues that purely static analysis can't
(missing security headers, actual XSS/injection behavior, and so on).

Runtime enforcement happens continuously inside the cluster, independent
of whatever already passed in CI: Kyverno's `ClusterPolicy` resources
block any pod that would run as root, run privileged, skip dropping Linux
capabilities, omit resource limits, or use the mutable `:latest` image
tag. Kubernetes' built-in Pod Security Admission controller additionally
enforces the "restricted" Pod Security Standard on the whole namespace.
NetworkPolicies enforce that the database is reachable only from the
backend, and the backend only from the frontend, with everything else
denied by default.

## 7. Estimated AWS cost for a 3-hour study session

This estimate covers exactly the scenario described: roughly one hour
spent provisioning and configuring the EKS cluster, ECR repositories,
IAM roles, ArgoCD, and the Load Balancer Controller, followed by about
two hours actually running the application and walking through the
architecture, then tearing everything down. Pricing below uses the AWS
Mumbai region (ap-south-1) on-demand rates and converts to INR at
approximately ₹95 per USD (the mid-2026 mid-market rate at the time this
was written); treat this as a planning estimate, not an invoice — actual
prices and exchange rates fluctuate, so confirm both on the AWS Pricing
pages and a live currency converter before you provision anything.

| Resource | Rate (USD) | 3-hour cost (USD) | 3-hour cost (INR, approx.) |
|---|---|---|---|
| EKS control plane | $0.10/hour | $0.30 | ₹29 |
| 2 x t3.medium worker nodes (EC2, ap-south-1) | $0.0448/hour each | $0.27 | ₹26 |
| Application Load Balancer | ~$0.0225/hour + minimal LCU charge | $0.08 | ₹8 |
| EBS volume for Postgres PVC (20 GB, gp3) | ~$0.08/GB-month -> negligible for 3 hours | $0.01 | ₹1 |
| ECR storage (two small images) | $0.10/GB-month -> negligible for 3 hours | <$0.01 | <₹1 |
| Data transfer (light testing traffic) | varies, assume minimal | ~$0.05 | ₹5 |
| **Total** | | **≈ $0.71** | **≈ ₹68** |

In practical terms, a 3-hour study session like this should cost well
under ₹100 (roughly $0.70-0.80 USD) if you use a small node group (2x
t3.medium or even t3.small) and delete everything immediately afterward.
The two costs that matter most are the EKS control plane's flat $0.10/hour
charge (this runs regardless of cluster size, so it's worth deleting the
cluster the moment you're done rather than leaving it idle) and the EC2
worker nodes, which is also where you have the most control — using fewer
or smaller nodes brings the total down further, though at some point
you'll have too little capacity to actually schedule the Postgres
StatefulSet, both Deployments, and their replicas.

A few things that would meaningfully change this estimate: if you're
outside the AWS free tier and provision a NAT Gateway for private-subnet
worker nodes, add roughly $0.045/hour ($0.14 for 3 hours, about ₹13) plus
data processing charges; if your EKS cluster happens to be running a
Kubernetes minor version that has aged out of standard support (this
applies after about 14 months from that version's release), the control
plane fee jumps sixfold to $0.60/hour — a brand-new cluster created for a
short study session won't hit this, but it's worth knowing about if you
keep a cluster around long-term. The security tools themselves
(Trivy/Checkov/Gitleaks/Kyverno/OWASP ZAP) cost nothing extra since
they're open-source tools you run yourself, not paid AWS services. Always
double-check current pricing at https://aws.amazon.com/eks/pricing/ and
https://aws.amazon.com/ec2/pricing/on-demand/ before provisioning, and set
a billing alert if you're new to AWS, since the biggest real-world risk
with EKS isn't the planned 3-hour session — it's forgetting to delete the
cluster afterward.
