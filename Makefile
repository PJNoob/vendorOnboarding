SHELL := /bin/sh
RELEASE ?= vendor-onboarding
NAMESPACE ?= vendor-onboarding
VALUES ?= infra/helm/builder/values.yaml
DOCUMENT_PYTHON ?= python3.14

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

install-document-service: ## Install Python OCR, LangGraph, and test dependencies
	$(DOCUMENT_PYTHON) -m venv services/document-verification/.venv
	services/document-verification/.venv/bin/pip install -e 'services/document-verification[test]'

document-service: ## Run document processing (export provider configuration first)
	services/document-verification/.venv/bin/python -m uvicorn vendor_verification.app:create_app --factory --app-dir services/document-verification --host 127.0.0.1 --port 8080

build-document-service: ## Build the Python document service image
	docker build -t vendor-document-verification:local services/document-verification

test-document-service: ## Run document verification tests without cloud calls
	services/document-verification/.venv/bin/python -m pytest services/document-verification/tests -q
