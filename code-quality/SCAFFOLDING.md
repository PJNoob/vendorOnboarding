# Repository scaffolding

Use this layout when adding a package, service, job, library, document, image, Helm chart, or Terraform stack. Do not invent a parallel tree. Layout is enforced by `guards/structure-guard/repo_structure.json`.

Python import namespace is `applied_ai`. When a standard cites `studio`, map it to `applied_ai` in the package you are editing.

---

## Root tree

```
.
├── Makefile                      # orchestration only; constants at top
├── AGENTS.md
├── README.md
├── docs/                         # human docs (architecture, runbooks). Not generated work dumps
├── etc/                          # repo-wide non-secret config
├── guards/                       # CI/hook policy. One directory per guard
├── infra/
│   ├── docker/                   # every Dockerfile + image Makefile
│   ├── helm/                     # application charts
│   ├── terraform/                # AWS stacks and modules
│   └── docker-compose.dev.yaml   # local compose only (never at repo root)
├── py/                           # Python uv projects
├── apps/                         # Next.js apps (builder, viewer) — this repo
├── packages/                     # Shared TS packages (@neo/prisma, @neo/schemas, …)
├── ts/                           # TypeScript apps and packages (generic GenAIStudio only)
├── scripts/                      # operator scripts, not application code
├── skills/                       # agent skills
└── .github/                      # workflows, PR template, CODEOWNERS
```

Forbidden at repo root (structure-guard): `Dockerfile*`, `docker-compose*`, `compose.y*ml`, `grafana-*`, notebooks/data artifacts (`*.ipynb`, `*.csv`, `*.parquet`, `*.jsonl`, `*.safetensors`, `*.ckpt`).

Do not put application source, Dockerfiles, Helm charts, or Terraform next to the root Makefile.

---

## Language partition

Source is split by language first, then by package. Never mix Python and TypeScript in one package. Never put a service at the repo root.

| Root | Language | What belongs |
|------|----------|----------------|
| `py/` | Python | uv packages: services, jobs, libs, pipelines, tests packages |
| `apps/` | TypeScript | Next.js apps (`apps/builder`, `apps/viewer`) |
| `packages/` | TypeScript | Shared workspace packages (`packages/prisma`, `packages/schemas`, …) |
| `ts/` | TypeScript | Only if a generic GenAIStudio `ts/` tree is present — **not** this repo |

A deployable Python unit is one package under `py/`. Builder/viewer are Next.js apps under `apps/`. Images, charts, and Terraform still live under `infra/`, keyed by the same package or app name.

---

## Python packages (`py/`)

Directory name is `snake_case` plus a role suffix. Structure-guard requires one of: `_service`, `_job`, `_lib`, `_pipeline`, `_tests`.

| Suffix | Role | Example |
|--------|------|---------|
| `_service` | Long-running process (REST, SageMaker, worker) | `scoring_service`, `mlops_trigger_service` |
| `_job` | One-shot batch / SageMaker / EKS job | `validation_evaluate_job`, `endpoint_inference_job` |
| `_lib` | Shared library, no container entrypoint | `common_lib`, `logger_lib`, `mlops_lib` |
| `_pipeline` | Pipeline definition / orchestration package | (add when needed) |
| `_tests` | Cross-package test harness | (add when needed) |
| `_mcp_service` | MCP tool service (also a `_service`) | |
| `_scheduling_service` | Cron / scheduler (also a `_service`) | |

Shared helpers go in `py/common_lib` and `py/logger_lib`. Do not rewrite them in a service.

### Standard Python package

```
py/<package_name>/
├── src/applied_ai/<package_name>/
│   ├── __init__.py
│   ├── __main__.py              # ApplicationRunner / entry (services and jobs)
│   ├── configuration_parser.py  # env → typed config only
│   ├── controller.py            # HTTP routes (REST services)
│   ├── server.py                # protocol adapter (e.g. SageMaker /ping)
│   ├── manager.py               # business logic (extends ServiceManager)
│   ├── components.py            # collaborators used by the manager
│   ├── model.py                 # enums + pydantic models for this package
│   ├── module.py                # DI wiring (extends ApplicationModule)
│   └── runner.py / executor.py  # job/worker loop when not REST
├── tests/
│   ├── conftest.py
│   ├── constants/               # test fixtures and config constants
│   ├── unit/
│   └── integration/
├── etc/
│   ├── .env.schema              # required keys, no values
│   └── .env.dev                 # local only; never commit secrets
├── pyproject.toml
├── uv.lock
├── Makefile
└── README.md
```

A `_lib` omits `__main__.py`, `controller.py`, `server.py`, and usually has no image.

### Where components live (Python)

- Package collaborators: `py/<package>/src/applied_ai/<package>/components.py` (or `components/` if the file splits).
- Shared collaborators used by two or more packages: `py/<name>_lib/src/applied_ai/<name>_lib/components.py` (see `mlops_lib`).
- Never `py/components/`, never repo-root `components/`, never inside `infra/`.

---

## TypeScript apps (`apps/`) and packages (`packages/`)

This repo does **not** put Next.js under `ts/`. Builder tRPC, Prisma, and schemas:

```
apps/builder/
├── src/
│   ├── features/<feature>/
│   │   ├── api/                 # tRPC: router.ts + one procedure per file
│   │   ├── common/              # Zod schemas, constants
│   │   ├── helpers/             # PascalCase utility classes (static methods)
│   │   ├── components/          # React for this feature
│   │   └── hooks/
│   ├── helpers/server/          # initTRPC, context, public/internal/app routers
│   ├── lib/trpc.ts              # client
│   └── pages/api/
│       ├── trpc/[trpc].ts       # studio mount (appRouter)
│       └── [...trpc].ts         # OpenAPI mount (publicRouter)
└── src/test/unit/features/<feature>/api/

packages/prisma/                 # schema, migrations, repositories, Makefile
packages/schemas/                # shared Zod + permission constants
```

tRPC procedure kinds, middleware, templates, and Prisma commands: [TRPC.md](TRPC.md), [architecture.md](architecture.md), [procedure-template.md](procedure-template.md), [prisma-package.md](prisma-package.md).

### Where components live (TypeScript)

- Feature UI: `apps/builder/src/features/<feature>/components/`.
- App-wide primitives: `apps/builder/src/components/` only for truly shared widgets.
- Never a repo-root `components/` folder. Never Python packages under `apps/` or `packages/`.

---

## `docs/`

```
docs/
├── <topic>.md                   # architecture, design, operator runbooks
└── diagrams/                    # optional
```

Put design and operator documentation here. Do not put generated session summaries, skill internals, or Terraform state notes here. Package-specific README stays in the package. Infra-specific notes that are Terraform/Helm how-to belong with those skills, not as a second tree.

---

## `etc/` (two levels)

| Path | Contents |
|------|----------|
| `etc/` (repo root) | Cross-cutting non-secret config (`etc/ci-actions/config.json`) |
| `py/<package>/etc/` or `apps/<app>/` / `packages/<name>/` env files | That package's `.env.schema`, sample env, local fixtures |
| `guards/<name>/` | Guard policy JSON — not `etc/` |

Secrets, `.env`, and credential files stay out of git.

---

## `infra/`

All runtime packaging and cloud lives under `infra/`. Application source does not.

```
infra/
├── docker/
│   ├── Makefile                 # image build / login / push only
│   └── <image_name>/            # same name as py/ts package (or product image)
│       ├── Dockerfile
│       └── entrypoint.sh        # optional
├── helm/
│   └── <chart>/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── <name-prefix>-values.yaml
│       └── templates/
├── terraform/
│   ├── bootstrap/               # state bucket, GitHub OIDC, deployer role
│   ├── common/                  # reusable modules (no backend)
│   │   └── aws/<module>/
│   ├── <stack>/                 # deployable root: `dev`, `ai-training`, …
│   ├── environments/<stack>/    # backend HCL / tfvars overrides only
│   └── scan/                    # Checkov config
└── docker-compose.dev.yaml
```

### Docker

- One directory per image: `infra/docker/<image_name>/Dockerfile`.
- Build context is the **repository root** so the Dockerfile can `COPY py/...` (or `ts/...`).
- `infra/docker/Makefile` is the only Makefile that builds and pushes images.
- Root `Makefile` may *delegate* (`cd infra/docker && $(MAKE) build-...`) but must not embed `docker build` recipes as the source of truth when a docker Makefile target exists.
- Do not put Dockerfiles in `py/<package>/`, `ts/<app>/`, or the repo root. An `entrypoint.sh` may live next to the Dockerfile; if a package already has `py/<pkg>/docker/entrypoint.sh`, the image Dockerfile copies it — do not add a second Dockerfile there.

Docker Makefile shape:

```makefile
GIT_ROOT := $(shell git rev-parse --show-toplevel)
INFRA_ROOT := $(GIT_ROOT)/infra
AWS_REGION ?= ap-southeast-1
VERSION ?= local
# ... image names / ECR repository names ...

build-<image>:
	docker build ...

ecr-login:
	aws ecr get-login-password ...

push-<image>: ecr-login build-<image>
	docker tag ...
	docker push ...

.PHONY: build-<image> ecr-login push-<image>
```

Required targets: `build-<image>` per image, `push-<image>` per image, `ecr-login`. No `tf-*`, no `test`, no app `install` here.

### Helm

- One chart per deployable app: `infra/helm/<chart>/`.
- Default values in `values.yaml`. Environment overlay: `<name-prefix>-values.yaml` (e.g. `applied-ai-dev-values.yaml`).
- Terraform may install cluster addons; application charts are upgraded via root Makefile `*-deploy` targets or GitOps, not by copying manifests into `py/`.

### Terraform

- Modules: `infra/terraform/common/aws/<module>/` (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`). No backend in a module.
- Stacks: `infra/terraform/<stack>/` — one state file each.
- Environment files: `infra/terraform/environments/<stack>/`.
- Drive plan/apply from the **root** Makefile (`tf-init`, `tf-plan`, `tf-apply`, …). Do not add a second Terraform Makefile under the stack.

---

## Makefiles

### Constants at the top only (STRICT)

Every Makefile (root, `infra/docker/Makefile`, each package Makefile):

1. `SHELL` / `.PHONY` / path and config variables first.
2. Then the first target (`help` at repo root).
3. **No** `:=` / `?=` / `=` assignments after the first recipe. If a target needs a value, it was declared at the top.
4. Override from the CLI (`make tf-plan TF_STACK=dev`), not by sprinkling variables mid-file.

```makefile
# CORRECT — all constants before any target
GIT_ROOT := $(shell git rev-parse --show-toplevel)
INFRA_ROOT := $(GIT_ROOT)/infra
PRODUCT ?= applied-ai
ENVIRONMENT ?= dev
AWS_REGION ?= ap-southeast-1
VERSION ?= local

help: ## List targets
	...

# FORBIDDEN — variable after a recipe
install:
	uv sync
PY_PACKAGES := foo
```

### Root Makefile — orchestration

Keep constants at the top, then these command groups. Add a target to an existing group; do not create a sibling Makefile at repo root.

| Group | Targets | Notes |
|-------|---------|--------|
| Help / repo hygiene | `help`, `hooks`, `license-check`, `settings`, `lint-workflows`, `check`, `bump-ci-actions` | Guards and CI pins |
| Python workspace | `install`, `test`, `test-coverage`, `update-lock`, `clean` | Loop `$(MAKE) -C` each `py/` package |
| Local compose | `setup-dev`, `destroy-dev` | `infra/docker-compose.dev.yaml` only |
| Images | `build-*`, `push-*`, `ecr-login` | Delegate to `infra/docker/Makefile` |
| Terraform | `tf-version-check`, `tf-bootstrap-*`, `tf-init`, `tf-validate`, `tf-plan`, `tf-apply`, `tf-destroy`, `name-prefix`, `state-bucket`, `tf-vars` | `cd` into `infra/terraform/<stack>` |
| Cluster / charts | `set-kubectl-context`, `*-deploy` | Helm upgrade using `infra/helm/` |
| Product workflows | e.g. `mlops-*` | Call into a `py/` package; do not duplicate logic |

Every user-facing target gets a `##` help comment so `make help` lists it.

### Package Makefile (`py/<pkg>/Makefile` or `ts/<app>/Makefile`)

Required targets: `use` (or equivalent install env), `install`, `test`, `test-coverage`, `update-lock`, `clean`.

Do not add `docker build`, `terraform`, or `helm` to a package Makefile.

---

## Adding a new Python service or job (checklist)

Code templates (REST, job, Lambda, RestClient, `Main.logger()` / `LoggerManager`): [PYTHON_TEMPLATES.md](PYTHON_TEMPLATES.md).

1. Create `py/<name>_<service|job>/` with the package tree above (`src/applied_ai/<name>_…/`, `tests/`, `etc/.env.schema`, `pyproject.toml`, `uv.lock`, `Makefile`).
2. Put models in `model.py`, env reads in `configuration_parser.py`, logic in `manager.py`, collaborators in `components.py`. Copy the matching template (REST, job, or Lambda).
3. Register the package on the root Makefile `PY_PACKAGES` (or image list) at the **top** with the other constants.
4. If it is containerized: `infra/docker/<name>_<service|job>/Dockerfile` plus `build-*` / `push-*` in `infra/docker/Makefile` (constants at top).
5. If it is a Kubernetes app: `infra/helm/<chart>/` and a root `*-deploy` target.
6. If it needs AWS: module under `infra/terraform/common/aws/` and wiring in the stack, not ad-hoc in the package.
7. Do not add a Dockerfile, compose file, or Helm chart at repo root.

## Adding a new TypeScript app (checklist)

1. Create `apps/<app>/` with `src/features/<feature>/{api,common,helpers,components,hooks}/`, tests, `package.json`.
2. Shared TS code goes in `packages/<name>/` (`@neo/...`), not copied into each app.
3. New builder APIs: follow [TRPC.md](TRPC.md). Mount the feature router on `publicRouter` (or `internalRouter` if it must stay off OpenAPI).
4. New tables: `packages/prisma/postgresql/schema.prisma` + Makefile migrate + `XxxRepository`. Never Prisma in feature files.
5. Image and chart still go under `infra/docker/` and `infra/helm/`, named after the app.
