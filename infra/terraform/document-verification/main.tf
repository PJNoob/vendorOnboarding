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
  project = var.project_id
  region  = var.document_ai_location
}

# The existing application worker and Python sidecar share this workload identity.
data "google_service_account" "worker" {
  project    = var.project_id
  account_id = "vendor-onboarding-worker"
}

resource "google_project_service" "ai" {
  for_each           = toset(["aiplatform.googleapis.com", "documentai.googleapis.com"])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_project_iam_member" "worker_ai" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/documentai.apiUser",
    "roles/serviceusage.serviceUsageConsumer",
  ])
  project    = var.project_id
  role       = each.value
  member     = "serviceAccount:${data.google_service_account.worker.email}"
  depends_on = [google_project_service.ai]
}

resource "google_document_ai_processor" "ocr" {
  project      = var.project_id
  location     = var.document_ai_location
  display_name = "vendor-onboarding-document-ocr"
  type         = "OCR_PROCESSOR"
  depends_on   = [google_project_service.ai]

  lifecycle {
    prevent_destroy = true
  }
}
