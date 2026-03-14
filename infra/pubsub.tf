# Seed Pub/Sub topic + subscription for the demo tenant
# In production, the FastAPI backend creates these dynamically per org
resource "google_pubsub_topic" "demo" {
  name = "pulseq-demo-topic"

  labels = {
    app = "pulseq"
    env = "demo"
  }
}

resource "google_pubsub_subscription" "demo" {
  name  = "pulseq-demo-subscription"
  topic = google_pubsub_topic.demo.name

  ack_deadline_seconds       = 20
  message_retention_duration = "600s" # 10 min

  retry_policy {
    minimum_backoff = "5s"
    maximum_backoff = "30s"
  }

  labels = {
    app = "pulseq"
    env = "demo"
  }
}

# Allow backend SA to publish to any topic in this project
resource "google_project_iam_member" "backend_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:pulseq-backend@${var.project_id}.iam.gserviceaccount.com"
}
