# IAM login authenticates the operator; PostgreSQL grants control access to data.
resource "google_sql_user" "database_operator" {
  project  = data.google_project.app.project_id
  instance = google_sql_database_instance.postgres.name
  name     = "jaiswalpratham1234@gmail.com"
  type     = "CLOUD_IAM_USER"
}

resource "google_project_iam_member" "database_operator" {
  for_each = toset([
    "roles/cloudsql.instanceUser",
    "roles/cloudsql.studioUser",
  ])
  project = data.google_project.app.project_id
  role    = each.value
  member  = "user:${google_sql_user.database_operator.name}"
}
