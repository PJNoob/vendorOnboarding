terraform {
  required_version = ">= 1.6.0"
  required_providers {
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.27.0"
    }
  }
  backend "gcs" {
    bucket = "voice-agent-yojnapath-yojnapath-terraform-state"
    prefix = "vendor-onboarding/database-access"
  }
}

# The operator helper supplies PGUSER/PGPASSWORD in memory and tunnels through
# the existing Cloud SQL Auth Proxy. Credentials are not Terraform variables.
provider "postgresql" {
  host            = "127.0.0.1"
  port            = 15432
  database        = "vendor_onboarding"
  sslmode         = "disable"
  superuser       = false
  connect_timeout = 15
}

resource "postgresql_grant" "operator_tables" {
  database    = "vendor_onboarding"
  role        = "jaiswalpratham1234@gmail.com"
  schema      = "public"
  object_type = "table"
  privileges  = ["SELECT"]
}

resource "postgresql_default_privileges" "operator_future_tables" {
  database    = "vendor_onboarding"
  role        = "jaiswalpratham1234@gmail.com"
  owner       = "vendor_app"
  schema      = "public"
  object_type = "table"
  privileges  = ["SELECT"]
}
