# nodejs-eks-service — working notes

## Status
- Phase: GENERATION complete → validation → ship

## Blueprint
- nodejs-eks@1.2.0, params: kubernetes_version=1.33, node_instance_type=t3.medium, node_desired_size=2, db_instance_class=db.t4g.micro, app_replicas=2, modules: database=postgres

## What the blueprint provided (do not regenerate)
- infra/ — VPC, EKS, node group, ECR, RDS, KMS, SGs, IAM (versions.tf pins aws ~> 5.82.0 — pinned below 5.83 intentionally: write-only password field breaks terraform output -raw database_url)
- k8s/ — deployment, service, hpa, pdb, serviceaccount templates with %%NAMESPACE%%/%%IMAGE%%/%%IMAGE_TAG%% placeholders
- Dockerfile — multi-stage node:20-alpine3.21, apk upgrade + npm removal to pass Trivy, RDS CA bundle baked in
- pipeline.yaml — 13 stages: lint/test/sast/secrets_scan/license_scan/sbom/iac_scan → provision → build_push → image_scan → configure → verify → notify
- eslint.config.mjs — ESLint flat config, commonjs, eqeqeq/no-unused-vars/no-var/prefer-const rules
- .prettierrc.json, .gitleaks.toml, .trivyignore

## What was generated fresh
- src/app.js — updated: added items router mount (conditional on db.isConfigured()), service name = nodejs-eks-service
- src/db.js — updated: added getPool() export so routes can run queries
- src/routes/items.js — full CRUD: GET/POST /api/items, GET/PUT/DELETE /api/items/:id, pg Pool queries, input validation
- db/migrations/001_create_items.sql — idempotent CREATE TABLE IF NOT EXISTS items (id, name, description, created_at)
- test/app.test.js — updated: added 503 test for /api/items when DB not configured, service name check
- README.md — full project README with arch, endpoints, local dev, pipeline, ops

## Pipeline change (rev 2)
- Added "Run database migrations" step in configure stage: PGSSLMODE=require psql "${DB_URL}" -f db/migrations/001_create_items.sql
- Runs before K8s manifests are applied; skips gracefully when DB_URL is absent

## Key decisions
- items router only mounted when db.isConfigured() — same app.js works with database=none
- getPool() throws if called without DATABASE_URL — routes will get a 500 caught by the error handler (never silently corrupt data)
- Migration is idempotent psql — no migration framework needed at this scale; add Flyway for longer-lived project
- No DB_PASSWORD secret needed — RDS password is managed by random_password.db in rds.tf (Terraform), DATABASE_URL comes from terraform output -raw database_url in the configure stage

## Gotchas
- aws provider pinned ~> 5.82.0 (see versions.tf comment): 5.83+ made db password write-only, breaking terraform output -raw database_url
- NLB blocks VPC deletion — destroy workflow removes K8s services first (kubectl delete svc), waits 120s, then terraform destroy
- GitHub drops job outputs containing PROJECT_NAME (it's a secret) — all infra values read fresh via terraform output in each stage that needs them
- ESLint flat config (eslint.config.mjs) uses 'no-unused-vars' with argsIgnorePattern: ^_ — error handler _next must be prefixed _ or eslint gate fails

## Next steps
1. validate_project
2. create_repo_and_push
3. deploy
