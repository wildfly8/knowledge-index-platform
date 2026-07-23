variable "project_id" {
  description = "GCP project (shared with otel-collector-platform)."
  type        = string
}

variable "region" {
  description = "Cloud Run and Artifact Registry region."
  type        = string
  default     = "us-central1"

  validation {
    condition     = contains(["us-west1", "us-central1", "us-east1"], var.region)
    error_message = "Use a Cloud Run free-tier region: us-west1, us-central1, or us-east1."
  }
}

variable "enable_foundation" {
  description = "Enable required APIs and Artifact Registry."
  type        = bool
  default     = false
}

variable "enable_runtime" {
  description = "Create secrets and Cloud Run after image is pushed."
  type        = bool
  default     = false
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
  default     = "knowledge-query-api"
}

variable "query_image" {
  description = "Pinned image URI in Artifact Registry."
  type        = string
  default     = ""
}

variable "upstash_vector_rest_url" {
  description = "Upstash Vector REST URL."
  type        = string
  sensitive   = true
  default     = ""
}

variable "upstash_vector_rest_token" {
  description = "Upstash Vector REST token."
  type        = string
  sensitive   = true
  default     = ""
}

variable "retrieve_api_secret" {
  description = "Bearer secret for /v1/* (KNOWLEDGE_RETRIEVE_API_SECRET)."
  type        = string
  sensitive   = true
  default     = ""
}
