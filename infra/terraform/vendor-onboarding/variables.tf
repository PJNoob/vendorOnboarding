variable "app_project_id" {
  description = "Globally unique ID for the new vendor onboarding project."
  type        = string
}

variable "billing_account" {
  description = "Billing account ID to associate with the new project."
  type        = string
  default     = "01049E-26EBE0-4482E9"
}

variable "organization_id" {
  description = "Organization in which the app project is created."
  type        = string
  default     = "55981582187"
}

variable "region" {
  description = "Region for vendor onboarding resources."
  type        = string
  default     = "asia-south1"
}

variable "secret_names" {
  description = "Secret Manager secret IDs; populate secret versions outside Terraform."
  type        = list(string)
  default = [
    "vendor-app-config",
    "vendor-auth-secret",
    "vendor-database-url",
    "vendor-google-client-id",
    "vendor-google-client-secret",
    "vendor-pii-key",
    "vendor-redis-url",
    "vendor-resend-api-key",
    "vendor-screening-token",
  ]
}

variable "host_project_id" {
  description = "Existing project containing the GKE cluster and VPC."
  type        = string
  default     = "voice-agent-yojnapath"
}
