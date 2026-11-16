# Vendor Gemini and Document AI

This independent Terraform root enables Vertex AI and Document AI in the existing vendor project, grants the existing worker identity access, and creates a Mumbai Enterprise Document OCR processor. It uses a separate state prefix and does not manage the application's database, network, cluster, or other Terraform stack.

Gemini requests use Vertex AI and the worker's existing Workload Identity via Application Default Credentials. API keys and downloaded service-account private keys are unnecessary. The model is Google's shared publisher model; this configuration does not provision dedicated model-serving compute. OCR and model requests are billed by usage.

For subsequent changes, authenticate with Application Default Credentials and run from this directory:

```sh
gcloud auth application-default login
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan -out=ai.tfplan
terraform apply ai.tfplan
terraform output -json document_service_environment
```

`terraform.tfvars` contains non-secret project, location, and model settings. The output provides the Python service's Google configuration. Keep the existing shared `DOCUMENT_SERVICE_TOKEN` in secret configuration; it authenticates worker-to-Python requests and is separate from Google authentication. Configure these settings in the application secret before deploying the Python sidecar. Provisioning cloud access alone does not deploy or restart application workers.

The OCR processor has deletion protection through `prevent_destroy`; APIs stay enabled if removed from Terraform. State is stored in the existing versioned GCS bucket under `vendor-onboarding/document-verification`, separate from `vendor-onboarding/app`. Do not commit generated state, plan files, credentials, or backend caches. Use `terraform plan` to review any future model, location, or IAM changes; changing the OCR location would replace the processor and is blocked by its lifecycle policy.
