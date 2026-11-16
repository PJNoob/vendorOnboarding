variable "project_id" {
  description = "Existing vendor onboarding Google Cloud project."
  type        = string
}

variable "document_ai_location" {
  description = "OCR processor region; kept in Mumbai with the existing application."
  type        = string
  default     = "asia-south1"
}

variable "gemini_location" {
  description = "Vertex AI Gemini endpoint location."
  type        = string
  default     = "global"
}

variable "gemini_model" {
  description = "Available Gemini model supporting structured JSON output. No dedicated model endpoint is provisioned."
  type        = string
  default     = "gemini-3.8-flash"
}
