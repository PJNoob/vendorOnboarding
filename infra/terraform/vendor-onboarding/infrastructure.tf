resource "google_sql_database_instance" "postgres" {
  project             = data.google_project.app.project_id
  name                = "vendor-onboarding-postgres"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true
  settings {
    edition           = "ENTERPRISE"
    tier              = "db-custom-2-8192"
    availability_type = "REGIONAL"
    disk_size         = 20
    disk_autoresize   = true
    disk_type         = "PD_SSD"
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
    ip_configuration {
      ipv4_enabled    = false
      private_network = "projects/${var.host_project_id}/global/networks/yojnapath-dev-vpc"
    }
  }
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.app]
}

resource "google_sql_database" "app" {
  project  = data.google_project.app.project_id
  instance = google_sql_database_instance.postgres.name
  name     = "vendor_onboarding"
}

resource "google_redis_instance" "app" {
  project                 = data.google_project.app.project_id
  name                    = "vendor-onboarding"
  region                  = var.region
  tier                    = "STANDARD_HA"
  memory_size_gb          = 5
  redis_version           = "REDIS_7_0"
  authorized_network      = "projects/${var.host_project_id}/global/networks/yojnapath-dev-vpc"
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  redis_configs = {
    maxmemory-policy = "noeviction"
  }
  depends_on = [google_project_service.app]
}
