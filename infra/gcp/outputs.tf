output "runtime_enabled" {
  value = var.enable_runtime
}

output "foundation_enabled" {
  value = local.foundation_enabled
}

output "artifact_registry_repository" {
  value = try(google_artifact_registry_repository.query_api[0].name, null)
}

output "query_image_prefix" {
  value = local.foundation_enabled ? "${var.region}-docker.pkg.dev/${var.project_id}/knowledge-query-api/query" : null
}

output "cloud_run_uri" {
  value = try(google_cloud_run_v2_service.query_api[0].uri, null)
}

output "consumer_environment_hint" {
  description = "Operational hint for read consumers."
  value = var.enable_runtime ? join("\n", [
    "KNOWLEDGE_INDEX_PLATFORM_URL=${google_cloud_run_v2_service.query_api[0].uri}",
    "KNOWLEDGE_RETRIEVE_API_SECRET=<same-as-retrieve_api_secret-in-tfvars>",
  ]) : null
}
