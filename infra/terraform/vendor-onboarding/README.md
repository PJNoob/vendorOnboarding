# Vendor onboarding GCP infrastructure

This configuration is incomplete and must not be applied yet. It defines the app project, Shared VPC attachment, private service connection, Cloud SQL, Redis, document buckets, artifact repository, application identities, GKE node pool and a reserved ingress address.

Before it can be deployed, complete and review Shared VPC service-agent grants, project-migration preflight, database-user bootstrap, Redis AUTH and CA delivery, secret synchronization, quarantine bucket CORS, namespace policies, migration jobs, monitoring and deployment runbook. Test the resulting Terraform plan against the actual organization and host project. Project migration is a separate operator action and is not managed here.

The Google provider can store sensitive Redis authentication material in Terraform state. Restrict state access and use a protected, versioned backend. Do not place secret values in tfvars or Helm values.

The GCS backend must be initialized with a distinct prefix under `vendor-onboarding/` in the existing Yojnapath Terraform-state bucket. Review the bucket's access and versioning before use. The configuration requires a unique `app_project_id`.
