# PulseQ — Multi-tenant Event-Driven Autoscaling SaaS on GCP

PulseQ is a production-grade SaaS platform demonstrating:
- **Multi-tenant auth** via GCP Identity Platform (Firebase Auth) + FastAPI JWT middleware
- **Per-org isolated Pub/Sub queues** provisioned on demand
- **KEDA event-driven autoscaling** on GKE — 0 to 10 pods based on queue depth
- **Workload Identity** — no credential files anywhere
- **Terraform IaC** for all GCP infrastructure
- **GitHub Actions CI/CD** with Workload Identity Federation (no JSON keys in CI either)
- **React dashboard** — live scaling visualisation, message publisher

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|------|---------|---------|
| `gcloud` CLI | latest | https://cloud.google.com/sdk/docs/install |
| `terraform` | >= 1.5 | https://developer.hashicorp.com/terraform/install |
| `kubectl` | latest | `gcloud components install kubectl` |
| `helm` | >= 3.12 | https://helm.sh/docs/intro/install |
| `docker` | latest | https://docs.docker.com/get-docker |
| `node` | >= 20 | https://nodejs.org |
| `python` | >= 3.12 | https://www.python.org |

Also: a Google account with billing enabled.

---

## Step-by-step deployment guide

### Step 1 — Clone and authenticate

```bash
git clone https://github.com/YOUR_USERNAME/pulseq.git
cd pulseq
gcloud auth login
gcloud auth application-default login
```

---

### Step 2 — Bootstrap GCP project

This creates the GCP project, enables APIs, creates service accounts, and writes your `.env` file.

```bash
chmod +x scripts/bootstrap.sh
bash scripts/bootstrap.sh
```

This takes about 2–3 minutes. When done, source your env:

```bash
source .env
echo "Project: $PROJECT_ID"
```

---

### Step 3 — Provision infrastructure with Terraform

```bash
cd infra

# Initialise Terraform providers
terraform init

# Preview what will be created (GKE, Cloud SQL, Pub/Sub, VPC, Secrets)
terraform plan \
  -var="project_id=$PROJECT_ID" \
  -var="region=us-central1" \
  -var="db_password=YourSecurePassword123!"

# Apply (takes ~10–15 min for GKE + Cloud SQL)
terraform apply \
  -var="project_id=$PROJECT_ID" \
  -var="region=us-central1" \
  -var="db_password=YourSecurePassword123!"

cd ..
```

After apply, note the outputs — especially `connect_to_cluster`.

---

### Step 4 — Connect to GKE and install KEDA

```bash
# Get kubectl credentials
gcloud container clusters get-credentials pulseq-cluster \
  --region us-central1 \
  --project $PROJECT_ID

# Verify connection
kubectl get nodes

# Install KEDA via Helm
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

helm upgrade --install keda kedacore/keda \
  --namespace keda \
  --create-namespace \
  --set "serviceAccount.annotations.iam\.gke\.io/gcp-service-account=keda-operator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --wait

# Verify KEDA is running
kubectl get pods -n keda
```

---

### Step 5 — Set up Firebase / Identity Platform

1. Go to https://console.firebase.google.com
2. Click **Add project** → select your GCP project (`$PROJECT_ID`)
3. Go to **Authentication** → **Sign-in method** → enable **Email/Password**
4. Go to **Project settings** → **Your apps** → click **</>** (Web)
5. Register app as "PulseQ Web"
6. Copy the Firebase config values — you'll need them in Step 7

Also download a service account key for local backend dev:
- Firebase Console → Project settings → **Service accounts** → **Generate new private key**
- Save as `backend/firebase-credentials.json` (never commit this)

---

### Step 6 — Build and deploy the consumer to GKE

```bash
# Authenticate Docker to Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push consumer image
CONSUMER_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pulseq/consumer:v1"
docker build -t "$CONSUMER_IMAGE" ./consumer
docker push "$CONSUMER_IMAGE"

# Apply manifests (substitute PROJECT_ID and IMAGE_TAG)
export PROJECT_ID=$PROJECT_ID
export REGION=us-central1
export IMAGE_TAG=v1

envsubst < manifests/serviceaccounts.yaml | kubectl apply -f -
envsubst < manifests/deployment.yaml      | kubectl apply -f -
kubectl apply -f manifests/keda-resources.yaml

# Verify
kubectl get pods
kubectl get scaledobject
kubectl get hpa
```

---

### Step 7 — Deploy the FastAPI backend to Cloud Run

```bash
# Build and push backend image
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pulseq/backend:v1"
docker build -t "$BACKEND_IMAGE" ./backend
docker push "$BACKEND_IMAGE"

# Deploy to Cloud Run
gcloud run deploy pulseq-api \
  --image "$BACKEND_IMAGE" \
  --region us-central1 \
  --service-account "pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-env-vars "PROJECT_ID=${PROJECT_ID}" \
  --no-allow-unauthenticated \
  --min-instances 1 \
  --memory 512Mi \
  --project $PROJECT_ID

# Get the backend URL
BACKEND_URL=$(gcloud run services describe pulseq-api \
  --region us-central1 \
  --format 'value(status.url)' \
  --project $PROJECT_ID)

echo "Backend URL: $BACKEND_URL"
```

---

### Step 8 — Deploy the React frontend

```bash
cd frontend

# Copy env template and fill in your Firebase config + backend URL
cp .env.example .env.local

# Edit .env.local with your values:
#   VITE_FIREBASE_API_KEY=...
#   VITE_FIREBASE_AUTH_DOMAIN=...
#   VITE_FIREBASE_PROJECT_ID=...
#   VITE_FIREBASE_APP_ID=...
#   VITE_API_URL=<your BACKEND_URL from step 7>

npm install
npm run build

# Build and push frontend image
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pulseq/frontend:v1"
docker build -t "$FRONTEND_IMAGE" .
docker push "$FRONTEND_IMAGE"

# Deploy to Cloud Run (public — this is the UI)
gcloud run deploy pulseq-frontend \
  --image "$FRONTEND_IMAGE" \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --project $PROJECT_ID

cd ..
```

---

### Step 9 — Test the full flow

```bash
# 1. Open the frontend URL in your browser
gcloud run services describe pulseq-frontend \
  --region us-central1 \
  --format 'value(status.url)' \
  --project $PROJECT_ID

# 2. Sign up → create your org → land on dashboard

# 3. In a terminal, watch pods scale in real time:
kubectl get pods -l app=pulseq-consumer -w

# 4. In another terminal, fire a burst of messages:
COUNT=30 bash scripts/generate-message.sh

# 5. Watch the dashboard — queue depth rises, replicas scale up
#    When messages drain, replicas scale back to 0
```

---

### Step 10 — Set up GitHub Actions CI/CD (optional but recommended)

1. Push your code to GitHub
2. In GitHub repo → **Settings** → **Variables** → add:
   - `PROJECT_ID` = your GCP project ID
   - `REGION` = `us-central1`
3. Set up Workload Identity Federation (no JSON keys in CI):

```bash
# Create WIF pool
gcloud iam workload-identity-pools create github-pool \
  --location global \
  --project $PROJECT_ID

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location global \
  --workload-identity-pool github-pool \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --project $PROJECT_ID

# Bind your SA to the pool (replace YOUR_GITHUB_USER/pulseq)
gcloud iam service-accounts add-iam-policy-binding \
  "pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_USER/pulseq"

# Get the WIF provider resource name → add as GitHub secret WIF_PROVIDER
gcloud iam workload-identity-pools providers describe github-provider \
  --location global \
  --workload-identity-pool github-pool \
  --format 'value(name)' \
  --project $PROJECT_ID
```

4. Add GitHub secrets:
   - `WIF_PROVIDER` = output from above
   - `GCP_SA_EMAIL` = `pulseq-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com`

Now every push to `main` auto-deploys backend and consumer.

---

## Local development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Set up local Postgres
docker run -d --name pulseq-pg \
  -e POSTGRES_USER=pulseq \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=pulseqdb \
  -p 5432:5432 postgres:15

cp .env.example .env
# Edit .env: set DATABASE_URL and FIREBASE_CREDENTIALS_PATH

uvicorn app.main:app --reload --port 8080
# API docs: http://localhost:8080/docs
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with Firebase config + VITE_API_URL=http://localhost:8080
npm run dev
# Open http://localhost:3000
```

---

## Architecture

```
User → Firebase Auth → FastAPI (Cloud Run)
                           ├── Cloud SQL (orgs, users)
                           ├── Secret Manager (DB creds)
                           └── Pub/Sub (per-org topic)
                                   ↓
                           KEDA ScaledObject
                                   ↓
                           HPA → Consumer Pods (0–10)
                                   ↓ ack messages
```

## Project structure

```
pulseq/
├── infra/          Terraform — GKE, SQL, Pub/Sub, IAM, VPC
├── backend/        FastAPI API — auth, orgs, users, messages
├── consumer/       GKE worker pod — Pub/Sub subscriber
├── manifests/      Kubernetes + KEDA manifests
├── frontend/       React dashboard
├── scripts/        Bootstrap + message generator
└── .github/        GitHub Actions CI/CD pipelines
```
# trigger
