output "document_service_environment" {
  description = "Non-secret Python service configuration. Use the existing worker identity through Application Default Credentials."
  value = {
    GOOGLE_CLOUD_PROJECT     = var.project_id
    GOOGLE_CLOUD_LOCATION    = var.gemini_location
    GEMINI_MODEL             = var.gemini_model
    DOCUMENT_AI_LOCATION     = google_document_ai_processor.ocr.location
    DOCUMENT_AI_PROCESSOR_ID = google_document_ai_processor.ocr.name
  }
}

output "worker_service_account" {
  value = data.google_service_account.worker.email
}

output "ocr_processor_resource" {
  value = google_document_ai_processor.ocr.id
}
