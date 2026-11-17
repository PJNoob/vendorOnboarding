terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  backend "gcs" {}
}

provider "google" {
  project = var.app_project_id
  region  = var.region
}

data "google_project" "app" {
  project_id = var.app_project_id
}

resource "google_project_service" "app" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ])
  project            = data.google_project.app.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  project       = data.google_project.app.project_id
  location      = var.region
  repository_id = "vendor-onboarding"
  format        = "DOCKER"
  depends_on    = [google_project_service.app]
}

resource "google_artifact_registry_repository_iam_member" "existing_node_reader" {
  project    = data.google_project.app.project_id
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:yojnapath-dev-vendor-nodes@voice-agent-yojnapath.iam.gserviceaccount.com"
}

resource "google_storage_bucket" "documents" {
  for_each                    = toset(["clean", "quarantine"])
  project                     = data.google_project.app.project_id
  name                        = "${var.app_project_id}-vendor-${each.key}"
  location                    = var.region
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }

  dynamic "cors" {
    for_each = each.key == "quarantine" ? [var.quarantine_upload_origins] : []
    content {
      max_age_seconds = 3600
      method          = ["PUT"]
      origin          = cors.value
      response_header = ["Content-Type", "x-goog-if-generation-match", "x-goog-content-length-range"]
    }
  }

  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.app]
}

resource "google_service_account" "app" {
  for_each     = toset(["web", "worker"])
  project      = data.google_project.app.project_id
  account_id   = "vendor-onboarding-${each.key}"
  display_name = "Vendor onboarding ${each.key}"
  depends_on   = [google_project_service.app]
}

resource "google_service_account_iam_member" "workload_identity" {
  for_each           = google_service_account.app
  service_account_id = each.value.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:voice-agent-yojnapath.svc.id.goog[vendor-onboarding/vendor-onboarding-${each.key}]"
}

resource "google_service_account_iam_member" "web_signing" {
  service_account_id = google_service_account.app["web"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app["web"].email}"
}

resource "google_project_iam_member" "cloud_sql_client" {
  for_each = google_service_account.app
  project  = data.google_project.app.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value.email}"
}

resource "google_storage_bucket_iam_member" "worker" {
  for_each = google_storage_bucket.documents
  bucket   = each.value.name
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.app["worker"].email}"
}

resource "google_storage_bucket_iam_member" "web_viewer" {
  for_each = google_storage_bucket.documents
  bucket   = each.value.name
  role     = "roles/storage.objectViewer"
  member   = "serviceAccount:${google_service_account.app["web"].email}"
}

resource "google_storage_bucket_iam_member" "web_upload" {
  bucket = google_storage_bucket.documents["quarantine"].name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.app["web"].email}"
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(var.secret_names)
  project   = data.google_project.app.project_id
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.app]
}
