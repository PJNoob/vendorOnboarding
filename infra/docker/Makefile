SHELL := /bin/sh
IMAGE ?= vendor-onboarding
REGISTRY ?= us-central1-docker.pkg.dev
VERSION ?= local

.PHONY: build-builder registry-login push-builder

build-builder: ## Build the application image
	docker build -f builder/Dockerfile -t "$(IMAGE):$(VERSION)" ../..

registry-login: ## Configure Artifact Registry authentication
	gcloud auth configure-docker "$(REGISTRY)"

push-builder: build-builder ## Push the tagged application image
	docker push "$(IMAGE):$(VERSION)"
