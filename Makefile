SHELL := /bin/sh
RELEASE ?= vendor-onboarding
NAMESPACE ?= vendor-onboarding
VALUES ?= infra/helm/builder/values.yaml

.PHONY: help install prisma-generate prisma-apply-migrations setup-dev dev seed build-builder builder-deploy

help: ## List available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "%-30s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies
	pnpm install

prisma-generate: ## Generate the database client
	$(MAKE) -C packages/prisma prisma-generate

prisma-apply-migrations: ## Apply committed database migrations
	$(MAKE) -C packages/prisma prisma-apply-migrations

setup-dev: ## Start local PostgreSQL and Redis
	docker compose -f infra/docker-compose.dev.yaml up -d

dev: ## Start the local web application
	pnpm dev

seed: ## Seed the workspace and the demo admin when enabled
	pnpm seed

build-builder: ## Build the web and worker image
	$(MAKE) -C infra/docker build-builder

builder-deploy: ## Install or upgrade the application on the selected cluster
	helm upgrade --install "$(RELEASE)" infra/helm/builder --namespace "$(NAMESPACE)" --create-namespace -f "$(VALUES)"
