output "gke_cluster_name" {
  value = google_container_cluster.main.name
}

output "gke_cluster_location" {
  value = google_container_cluster.main.location
}

output "db_private_ip" {
  value     = google_sql_database_instance.main.private_ip_address
  sensitive = true
}

output "pubsub_topic" {
  value = google_pubsub_topic.demo.name
}

output "pubsub_subscription" {
  value = google_pubsub_subscription.demo.name
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/pulseq"
}

output "connect_to_cluster" {
  value = "gcloud container clusters get-credentials pulseq-cluster --region ${var.region} --project ${var.project_id}"
}
