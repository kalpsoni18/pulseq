#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────
# PulseQ — GCP Project Bootstrap
# Run this ONCE to set up your GCP project.
# Prerequisites: gcloud CLI installed + logged in
# ─────────────────────────────────────────────

REGION="us-central1"
PROJECT_ID="${PULSEQ_PROJECT_ID:-pulseq-$(date +%s)}"

echo ""
echo "=============================="
echo "  PulseQ Bootstrap"
echo "  Project: $PROJECT_ID"
echo "  Region:  $REGION"
echo "=============================="
echo ""

# 1. Create GCP project
echo "[1/8] Creating GCP project..."
gcloud projects create "$PROJECT_ID" --name="PulseQ SaaS Demo"
gcloud config set project "$PROJECT_ID"

# 2. Link billing account
echo "[2/8] Linking billing account..."
BILLING_ACCOUNT=$(gcloud beta billing accounts list --format='value(name)' --limit=1)
if [ -z "$BILLING_ACCOUNT" ]; then
  echo "ERROR: No billing account found. Create one at https://console.cloud.google.com/billing"
  exit 1
fi
gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

# 3. Enable APIs
echo "[3/8] Enabling required GCP APIs (this takes ~2 min)..."
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  identitytoolkit.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com

# 4. Create Artifact Registry
echo "[4/8] Creating Artifact Registry..."
gcloud artifacts repositories create pulseq \
  --repository-format=docker \
  --location="$REGION" \
  --description="PulseQ container images"

# 5. Configure Docker auth
echo "[5/8] Configuring Docker auth for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 6. Create GCP Service Accounts
echo "[6/8] Creating service accounts..."

# KEDA operator SA
gcloud iam service-accounts create keda-operator \
  --display-name="KEDA Operator" \
  --project="$PROJECT_ID"

# Consumer SA
gcloud iam service-accounts create pulseq-consumer \
  --display-name="PulseQ Consumer" \
  --project="$PROJECT_ID"

# Backend API SA
gcloud iam service-accounts create pulseq-backend \
  --display-name="PulseQ Backend API" \
  --project="$PROJECT_ID"

# 7. Grant IAM roles
echo "[7/8] Granting IAM roles..."

# KEDA needs monitoring.viewer to read Pub/Sub metrics
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:keda-operator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/monitoring.viewer"

# Consumer needs pubsub.subscriber
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:pulseq-consumer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

# Backend needs pubsub.publisher + pubsub.editor (create topics) + cloudsql.client + secretmanager.secretAccessor
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.editor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Backend on Cloud Run needs to impersonate itself
gcloud iam service-accounts add-iam-policy-binding \
  "pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"

# 8. Write .env file
echo "[8/8] Writing .env file..."
cat > .env <<EOF
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ARTIFACT_REGISTRY=${REGION}-docker.pkg.dev/${PROJECT_ID}/pulseq
KEDA_SA=keda-operator@${PROJECT_ID}.iam.gserviceaccount.com
CONSUMER_SA=pulseq-consumer@${PROJECT_ID}.iam.gserviceaccount.com
BACKEND_SA=pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com
EOF

echo ""
echo "=============================="
echo "  Bootstrap complete!"
echo "  Next step: cd infra && terraform init && terraform apply"
echo "  Your .env file has been written."
echo "=============================="
