---
name: code-quality
description: >-
  Enforces GenAIStudio strict coding standards for error handling, constants,
  environment access, alphabetical ordering, OpenAPI, Docker, modeling,
  logging, shared libraries, ORM, and service layout. Also enforces repository
  scaffolding: language roots (py/, apps/, packages/), package suffixes, where
  components live, docs/, etc/, infra/docker|helm|terraform, root vs docker
  Makefiles, Makefile constants at the top only, Python templates, and builder
  tRPC (protectedProcedure, middleware, authn/authz, Zod/OpenAPI, Prisma
  repositories, packages/prisma Makefile). Use when writing, editing,
  reviewing, or refactoring Python, TypeScript, tRPC APIs, Dockerfiles, Prisma
  migrations, configuration, tests, Makefiles, or when adding a package,
  service, job, library, REST/tRPC endpoint, REST client, logger, image, Helm
  chart, Terraform stack, or folder.
---

# GenAIStudio code quality

alwaysApply: true

Read [STANDARDS.md](STANDARDS.md) and follow every rule in it exactly. Do not relax, skip, or paraphrase a rule.

Read [SCAFFOLDING.md](SCAFFOLDING.md) before creating or moving a file, package, Makefile, Dockerfile, Helm chart, Terraform stack, or `docs/` / `etc/` path. Put new work on that tree. Do not invent a parallel layout.

Read [PYTHON_TEMPLATES.md](PYTHON_TEMPLATES.md) before adding or changing a Python `_service`, `_job`, `_lib`, REST controller, REST client, or logger usage. Copy those templates. Do not invent a second bootstrap.

Read [TRPC.md](TRPC.md) before adding or changing a builder tRPC procedure, router, middleware, Zod/OpenAPI schema, permission check, or Prisma repository/migration. Copy those templates. Do not invent a second API shape.

- Middleware, context, authn/authz: [architecture.md](architecture.md)
- Procedure + repository copy-paste: [procedure-template.md](procedure-template.md)
- `packages/prisma` tree, Makefile, scripts: [prisma-package.md](prisma-package.md)

Apply the standards to new code and to every line you change. Do not restyle unrelated code only to satisfy a rule.
