# GKE Cluster with Workload Identity enabled
resource "google_container_cluster" "main" {
  name     = "pulseq-cluster"
  location = var.region

  # Remove default node pool immediately — we manage our own
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Workload Identity — allows K8s SAs to act as GCP SAs (no key files)
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  deletion_protection = false
}

resource "google_container_node_pool" "main" {
  name       = "pulseq-nodes"
  location   = var.region
  cluster    = google_container_cluster.main.name
  node_count = 2

  node_config {
    machine_type = "e2-standard-2"
    disk_size_gb = 50

    # Required for Workload Identity on nodes
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
  }

  autoscaling {
    min_node_count = 1
    max_node_count = 4
  }
}

# Workload Identity binding — KEDA operator
resource "google_service_account_iam_binding" "keda_wi" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/keda-operator@${var.project_id}.iam.gserviceaccount.com"
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[keda/keda-operator]"
  ]
}

# Workload Identity binding — consumer pods
resource "google_service_account_iam_binding" "consumer_wi" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/pulseq-consumer@${var.project_id}.iam.gserviceaccount.com"
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[default/pulseq-consumer]"
  ]
}
