output "buckets" {
  value = { for key, bucket in google_storage_bucket.documents : key => bucket.name }
}

output "project_id" {
  value = data.google_project.app.project_id
}

output "repository" {
  value = google_artifact_registry_repository.app.name
}

output "service_accounts" {
  value = { for key, account in google_service_account.app : key => account.email }
}

output "cloud_sql_instance" {
  value = google_sql_database_instance.postgres.connection_name
}

output "ingress_ip" {
  value = "8.228.226.95"
}

output "redis_host" {
  value = google_redis_instance.app.host
}
