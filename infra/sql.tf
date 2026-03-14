# Cloud SQL — Postgres 15 (private IP, no public exposure)
resource "google_sql_database_instance" "main" {
  name             = "pulseq-db"
  database_version = "POSTGRES_15"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = false
}

resource "google_sql_database" "pulseq" {
  name     = "pulseqdb"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "pulseq"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# Store DB connection string in Secret Manager
resource "google_secret_manager_secret" "db_url" {
  secret_id = "pulseq-db-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_url" {
  secret = google_secret_manager_secret.db_url.id
  secret_data = "postgresql+asyncpg://pulseq:${var.db_password}@${google_sql_database_instance.main.private_ip_address}:5432/pulseqdb"
}
