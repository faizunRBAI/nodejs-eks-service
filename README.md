# nodejs-eks-service

A production-ready Node.js/Express REST API running on Amazon EKS, built from the **nodejs-eks@1.2.0** blueprint. Provides a fully managed Kubernetes platform with a 13-stage security-gated CI/CD pipeline.

## Architecture

```
API Clients
    │ HTTPS
    ▼
Network Load Balancer
    │ port 80
    ▼
Node.js API Pods (EKS) ─── Postgres (RDS) ──► Audit + Flow Logs
    │ image pull
ECR Repository
```

**Infrastructure (us-east-1):**
| Component | Detail |
|---|---|
| EKS control plane | Kubernetes 1.33, KMS envelope encryption, audit logging |
| Managed node group | 2 × t3.medium (scales to 4 via HPA) |
| VPC | 2 AZs, public + private subnets, Internet Gateway |
| ECR | Scan-on-push, 20-image lifecycle policy |
| RDS Postgres | db.t4g.micro, encrypted at rest, 7-day backups |
| Network Load Balancer | Fronts the API service |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check — does NOT touch the database |
| `GET` | `/ready` | Readiness check — verifies DB connection |
| `GET` | `/api/info` | Service metadata (version, node, environment) |
| `GET` | `/api/items` | List items (`?limit=50&offset=0`) |
| `POST` | `/api/items` | Create item (`{ name, description? }`) |
| `GET` | `/api/items/:id` | Get item by ID |
| `PUT` | `/api/items/:id` | Update item (`{ name?, description? }`) |
| `DELETE` | `/api/items/:id` | Delete item |
| `GET` | `/` | Operator dashboard (HTML) |

## Local Development

**Prerequisites:** Node.js 20+, Docker, a local Postgres instance.

```bash
# Install dependencies
npm install

# Start a local Postgres (Docker)
docker run -d --name pg-local \
  -e POSTGRES_DB=appdb \
  -e POSTGRES_USER=appuser \
  -e POSTGRES_PASSWORD=localdev \
  -p 5432:5432 postgres:16-alpine

# Run migrations
DATABASE_SSL=disable psql "postgres://appuser:localdev@localhost:5432/appdb" \
  -f db/migrations/001_create_items.sql

# Start the server
DATABASE_URL="postgres://appuser:localdev@localhost:5432/appdb" \
DATABASE_SSL=disable \
npm run dev
```

The API is available at `http://localhost:3000`.

## Running Tests

```bash
npm test
```

Tests run against the app without a live database — the items routes are gracefully skipped when `DATABASE_URL` is unset.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (in prod) | Postgres connection string — set automatically by the pipeline from the RDS terraform output |
| `DATABASE_SSL` | No | Set to `disable` for local dev against a plaintext Postgres |
| `DATABASE_SSL_CA` | No | Path to RDS CA bundle (default: `/app/certs/rds-global-bundle.pem` in the container) |
| `PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | No | `production` in the cluster |
| `APP_VERSION` | No | Set to the image tag by the Kubernetes manifest |
| `DB_POOL_MAX` | No | Max Postgres pool connections (default: `5`) |

`DATABASE_URL` is written into a Kubernetes Secret (`app-database`) by the `configure` pipeline stage — never hardcoded or committed.

## Pipeline

The deploy pipeline runs on every push to `main`. All seven gates run in parallel before any AWS resource is touched:

```
lint ──────────────────────────────────────────────────────┐
test ──────────────────────────────────────────────────────┤
sast (Semgrep) ────────────────────────────────────────────┤
secrets_scan (Gitleaks) ───────────────────────────────────┼─► provision ─► build_push ─► image_scan ─► configure ─► verify ─► notify
license_scan ──────────────────────────────────────────────┤
sbom (CycloneDX) ──────────────────────────────────────────┤
iac_scan (Trivy + Checkov) ────────────────────────────────┘
```

Security artefacts (Semgrep SARIF, Gitleaks SARIF, licence CSV, source SBOM, image SBOM) are attached to every workflow run for 30–90 days.

## Operations

**View live logs:**
```bash
kubectl logs -n <project-name> -l app.kubernetes.io/name=api -f
```

**Check pod status:**
```bash
kubectl get pods -n <project-name>
kubectl describe pod -n <project-name> <pod-name>
```

**Run a migration manually:**
```bash
# DATABASE_URL is in the app-database Kubernetes Secret
kubectl exec -n <project-name> deploy/api -- \
  node -e "require('./src/db').ping().then(() => process.exit(0))"
```

**Scale manually (HPA handles this automatically under load):**
```bash
kubectl scale deployment api -n <project-name> --replicas=3
```

**Destroy the stack:**
Use the platform's Destroy action — it removes Kubernetes services first (so the NLB is deleted), then runs `terraform destroy`. Never run `terraform destroy` directly: the NLB blocks VPC deletion.

## Adding Migrations

Add a new numbered file to `db/migrations/`:
```bash
# e.g. db/migrations/002_add_tags.sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
```

Update the configure stage in `.udap/pipeline.yaml` to also run the new file (or switch to a proper migration tool like Flyway/Liquibase for longer-lived projects).
