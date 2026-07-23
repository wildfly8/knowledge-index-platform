locals {
  foundation_enabled = var.enable_foundation || var.enable_runtime
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  secrets = var.enable_runtime ? {
    upstash-url    = var.upstash_vector_rest_url
    upstash-token  = var.upstash_vector_rest_token
    retrieve-token = var.retrieve_api_secret
  } : {}
}

resource "google_project_service" "required" {
  for_each = local.foundation_enabled ? local.required_apis : toset([])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "query_api" {
  count = local.foundation_enabled ? 1 : 0

  location      = var.region
  repository_id = "knowledge-query-api"
  format        = "DOCKER"
  description   = "Knowledge index query API (Feature 003/005)"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "query_api" {
  count = var.enable_runtime ? 1 : 0

  account_id   = "${var.service_name}-sa"
  display_name = "Knowledge Query API"
}

resource "google_secret_manager_secret" "runtime" {
  for_each = local.secrets

  secret_id = "${var.service_name}-${each.key}"
  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "runtime" {
  for_each = local.secrets

  secret      = google_secret_manager_secret.runtime[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "query_api" {
  for_each = local.secrets

  secret_id = google_secret_manager_secret.runtime[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.query_api[0].email}"
}

resource "google_cloud_run_v2_service" "query_api" {
  count = var.enable_runtime ? 1 : 0

  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.query_api[0].email
    timeout         = "300s"

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.query_image

      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
        cpu_idle = false
      }

      env {
        name  = "KNOWLEDGE_INFERENCE_WORKER"
        value = "0"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "KNOWLEDGE_REQUIRE_HTTPS"
        value = "true"
      }
      env {
        name  = "KNOWLEDGE_PLATFORM_HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "TRANSFORMERS_CACHE"
        value = "/app/models/transformers-cache"
      }
      env {
        name = "UPSTASH_VECTOR_REST_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["upstash-url"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "UPSTASH_VECTOR_REST_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["upstash-token"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "KNOWLEDGE_RETRIEVE_API_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["retrieve-token"].secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 10
        failure_threshold = 18
      }
    }
  }

  lifecycle {
    precondition {
      condition = (
        length(var.query_image) > 0 &&
        length(var.upstash_vector_rest_url) > 0 &&
        length(var.upstash_vector_rest_token) > 0 &&
        length(var.retrieve_api_secret) >= 32
      )
      error_message = "Runtime requires pinned image, Upstash credentials, and retrieve_api_secret (32+ chars)."
    }
  }

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.query_api,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.enable_runtime ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.query_api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
