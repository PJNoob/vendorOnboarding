SHELL := /bin/sh
NAME ?= change
PNPM ?= pnpm
SCHEMA := postgresql/schema.prisma
INITIAL := postgresql/migrations/20261113000000_initial/migration.sql

.PHONY: prisma-apply-migrations prisma-generate prisma-generate-initial prisma-generate-migrations

prisma-generate: ## Generate the Prisma client
	$(PNPM) db:generate

prisma-generate-initial: ## Generate the initial SQL from the Prisma schema
	$(PNPM) dlx prisma@6.19.0 migrate diff --from-empty --to-schema-datamodel $(SCHEMA) --script --output $(INITIAL)

prisma-generate-migrations: ## Generate a follow-up migration
	$(PNPM) migrate:dev --name "$(NAME)"

prisma-apply-migrations: ## Apply committed migrations
	$(PNPM) migrate:deploy
