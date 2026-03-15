# PulseQ

**Event-driven autoscaling message queue SaaS — built on GCP**

PulseQ lets your application publish messages to an isolated queue and automatically scales Kubernetes worker pods from **0 to 10** based on queue depth. No idle compute. No manual scaling. Pay for exactly what you use.

![Architecture](https://img.shields.io/badge/GCP-Pub%2FSub-blue) ![KEDA](https://img.shields.io/badge/KEDA-Autoscaling-green) ![Terraform](https://img.shields.io/badge/Terraform-IaC-purple) ![CI/CD](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-orange)

---

## How it works

```
Your App  ──POST /messages/publish──►  FastAPI (Cloud Run)
                                              │
                                              ▼
                                       GCP Pub/Sub
                                      (per-org topic)
                                              │
                               ┌─────────────┘
                               ▼
                        KEDA ScaledObject
                     polls every 5 seconds
                               │
                    25 msgs → 5 pods
                    50 msgs → 10 pods
                     0 msgs → 0 pods
                               │
                               ▼
                    GKE Consumer Pods (0–10)
                    pull, process, ack messages
```

**The scaling rule:** 1 pod per 5 unacked messages, maximum 10 pods, minimum 0. After the queue drains, pods scale back to zero after a 30-second cooldown.

---

## Features

- **Multi-tenant isolation** — every organisation gets a dedicated Pub/Sub topic and subscription. Tenant A cannot access Tenant B's queue, data, or workers.
- **Scale to zero** — no pods run when there are no messages. Zero idle compute cost.
- **Firebase Auth** — Google SSO and Email/Password sign-in. JWT custom claims enforce org-level access on every API request.
- **Infrastructure as Code** — all 16 GCP resources defined in Terraform. Reproducible from scratch in 15 minutes.
- **CI/CD** — GitHub Actions builds, pushes, and deploys on every commit to `main`. Three pipelines: backend, consumer, frontend.
- **Workload Identity** — Kubernetes service accounts bound to GCP IAM service accounts. No credential files anywhere.
- **Private database** — Cloud SQL on a private VPC with no public IP. Connection string stored in Secret Manager.
- **Security hardened** — CORS restricted to frontend domain, Dependabot enabled, SECURITY.md in place, branch protection active.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GCP Project                          │
│                                                         │
│   ┌──────────────┐    ┌──────────────────────────────┐  │
│   │   React UI   │    │   FastAPI Backend             │  │
│   │  Cloud Run   │───►│   Cloud Run                  │  │
│   │  (public)    │    │   Firebase JWT auth           │  │
│   └──────────────┘    │   org_id on every request     │  │
│                       └──────────┬───────────────────┘  │
│                                  │                       │
│              ┌───────────────────┼──────────────┐       │
│              ▼                   ▼              ▼        │
│        Cloud SQL           Pub/Sub         Secret        │
│        (private VPC)      per-org topic   Manager        │
│        orgs, users                                       │
│                                  │                       │
│                                  ▼                       │
│   ┌──────────────────────────────────────────────────┐   │
│   │              GKE Cluster                        │   │
│   │                                                  │   │
│   │   KEDA ScaledObject ──► HPA ──► Consumer Pods   │   │
│   │   (polls Cloud Monitoring     (0 to 10 pods)    │   │
│   │    every 5 seconds)                              │   │
│   │                                                  │   │
│   │   Workload Identity: K8s SA ──► GCP IAM SA      │   │
│   └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend API | FastAPI (Python 3.12) on Cloud Run |
| Authentication | Firebase Identity Platform (Google SSO + Email/Password) |
| Database | Cloud SQL PostgreSQL 15 (private VPC) |
| Message queue | GCP Pub/Sub (one topic per org) |
| Autoscaling | KEDA on GKE (Kubernetes Event-Driven Autoscaling) |
| Infrastructure | Terraform (16 resources) |
| CI/CD | GitHub Actions (3 pipelines) |
| Container registry | GCP Artifact Registry |
| Secrets | GCP Secret Manager |
| Networking | VPC + VPC Connector |
| Security | GCP Workload Identity |

---

## Real-world use cases

| Use case | What gets published | What workers do |
|----------|-------------------|-----------------|
| E-commerce | Order placed events | Process payment, update inventory, send confirmation |
| Media platform | Video uploaded events | Transcode to multiple formats in parallel |
| SaaS product | Report generation jobs | Run heavy processing without blocking the user |
| Fintech | Transaction events | Fraud detection, ledger updates, alerts |
| Marketing tool | Campaign send jobs | Deliver 100,000 emails without timeouts |

---

## Quick start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| `gcloud` CLI | 560+ | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |
| `terraform` | 1.5+ | `brew install hashicorp/tap/terraform` |
| `kubectl` | latest | `gcloud components install kubectl` |
| `gke-gcloud-auth-plugin` | latest | `gcloud components install gke-gcloud-auth-plugin` |
| `helm` | 3.12+ | `brew install helm` |
| `docker` | 25+ | [docker.com](https://docs.docker.com/get-docker) |
| `node` | 20+ | [nodejs.org](https://nodejs.org) |
| `python` | 3.12+ | [python.org](https://www.python.org) |

> **Apple Silicon Mac:** Add `export DOCKER_DEFAULT_PLATFORM=linux/amd64` to your `~/.zshrc` before building. GKE requires AMD64 images.

---

### Step 1 — Clone and authenticate

```bash
git clone https://github.com/kalpsoni18/pulseq.git
cd pulseq
gcloud auth login
gcloud auth application-default login
```

### Step 2 — Bootstrap GCP project

```bash
chmod +x scripts/bootstrap.sh
bash scripts/bootstrap.sh
source .env
```

> If billing link fails: `gcloud beta billing accounts list` then `gcloud beta billing projects link $PROJECT_ID --billing-account=YOUR_ID`

### Step 3 — Provision infrastructure (~12 min)

```bash
cd infra && terraform init
terraform apply \
  -var="project_id=$PROJECT_ID" \
  -var="region=us-central1" \
  -var="db_password=YourSecurePassword"
cd ..
```

> If Workload Identity binding fails: GKE is still booting. Wait 2 min and re-run `terraform apply`.

### Step 4 — Connect to GKE + install KEDA

```bash
gcloud container clusters get-credentials pulseq-cluster \
  --region us-central1 --project $PROJECT_ID

helm repo add kedacore https://kedacore.github.io/charts && helm repo update
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace \
  --set "serviceAccount.annotations.iam\.gke\.io/gcp-service-account=keda-operator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --wait
```

### Step 5 — Create VPC connector

```bash
gcloud compute networks subnets create pulseq-connector-subnet \
  --network pulseq-vpc --region us-central1 \
  --range 10.3.0.0/28 --project $PROJECT_ID

gcloud compute networks vpc-access connectors create pulseq-connector \
  --region us-central1 --subnet pulseq-connector-subnet \
  --subnet-project $PROJECT_ID \
  --min-instances 2 --max-instances 3 --project $PROJECT_ID
```

### Step 6 — Deploy consumer to GKE

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/consumer:v1 ./consumer
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/consumer:v1

export IMAGE_TAG=v1
envsubst < manifests/serviceaccounts.yaml | kubectl apply -f -
envsubst < manifests/deployment.yaml | kubectl apply -f -
kubectl apply -f manifests/keda-resources.yaml
kubectl set image deployment/pulseq-consumer \
  consumer=us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/consumer:v1
```

### Step 7 — Deploy backend to Cloud Run

```bash
docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/backend:v1 ./backend
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/backend:v1

gcloud run deploy pulseq-api \
  --image us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/backend:v1 \
  --region us-central1 \
  --service-account pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars "PROJECT_ID=${PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-secrets "DATABASE_URL=pulseq-db-url:latest" \
  --allow-unauthenticated --min-instances 1 --memory 1Gi \
  --vpc-connector pulseq-connector --vpc-egress private-ranges-only \
  --project $PROJECT_ID
```

Grant Firebase permissions:

```bash
for role in roles/firebase.admin roles/identitytoolkit.admin roles/run.admin; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role"
done

gcloud iam service-accounts add-iam-policy-binding \
  pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com \
  --member="serviceAccount:pulseq-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### Step 8 — Firebase setup (browser)

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project → select `$PROJECT_ID`
2. Authentication → Sign-in method → enable **Email/Password** and **Google**
3. Project settings → Your apps → `</>` Web → register app → copy `firebaseConfig`
4. Authentication → Settings → Authorized domains → add your Cloud Run frontend URL

### Step 9 — Deploy frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in Firebase config + VITE_API_URL

npm install && npm run build
docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/frontend:v1 .
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/frontend:v1

gcloud run deploy pulseq-frontend \
  --image us-central1-docker.pkg.dev/${PROJECT_ID}/pulseq/frontend:v1 \
  --region us-central1 --allow-unauthenticated --port 8080 \
  --project $PROJECT_ID
cd ..
```

### Step 10 — Post-deploy KEDA fix

After creating your first org, update KEDA to watch the correct subscription:

```bash
kubectl annotate serviceaccount pulseq-consumer \
  iam.gke.io/gcp-service-account=pulseq-consumer@${PROJECT_ID}.iam.gserviceaccount.com \
  --overwrite

# Replace pulseq-YOUR-ORG-sub with subscription name shown in dashboard
kubectl patch scaledobject pulseq-consumer-scaledobject --type merge \
  -p '{"spec":{"triggers":[{"type":"gcp-pubsub","authenticationRef":{"kind":"TriggerAuthentication","name":"pulseq-gcp-trigger-auth"},"metadata":{"mode":"SubscriptionSize","value":"5","subscriptionName":"pulseq-YOUR-ORG-sub"}}]}}'

kubectl rollout restart deployment/pulseq-consumer
```

---

## GitHub Actions CI/CD

| Pipeline | Trigger | Steps |
|----------|---------|-------|
| `backend.yml` | `backend/**` pushed | Lint (ruff) → Build AMD64 → Push to AR → Deploy Cloud Run |
| `consumer.yml` | `consumer/**` or `manifests/**` | Build AMD64 → Push to AR → Deploy to GKE |
| `frontend.yml` | `frontend/**` | Build → Push to AR → Deploy Cloud Run |

**Required GitHub secrets:**
- `GCP_CREDENTIALS_JSON` — service account JSON for `pulseq-backend` SA
- `DATABASE_URL` — PostgreSQL connection string

---

## Local development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

docker run -d --name pulseq-pg \
  -e POSTGRES_USER=pulseq -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=pulseqdb -p 5432:5432 postgres:15

cp .env.example .env
uvicorn app.main:app --reload --port 8080
# Docs: http://localhost:8080/docs
```

### Frontend

```bash
cd frontend && npm install
cp .env.example .env.local
npm run dev
# http://localhost:3000
```

---

## API reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | None | Health check |
| `/auth/me` | GET | JWT | Current user profile |
| `/orgs/` | POST | JWT | Create org + provision Pub/Sub topic |
| `/orgs/me` | GET | JWT | Get current org |
| `/users/` | GET | JWT | List users in org |
| `/messages/publish` | POST | JWT | Publish messages to org topic |
| `/messages/status` | GET | JWT | Queue depth + replica count |

Full interactive docs at: `https://YOUR-BACKEND-URL.us-central1.run.app/docs`

---

## Cost

| Service | Spec | Monthly |
|---------|------|---------|
| GKE cluster | 2x e2-standard-2 | ~$97 |
| Cloud SQL | db-f1-micro | ~$10 |
| VPC connector | 2x e2-micro | ~$15 |
| Cloud Run backend | min 1 instance, 1Gi | ~$5 |
| Cloud Run frontend | scales to zero | ~$1 |
| Pub/Sub + Monitoring | pay per use | ~$1 |
| **Total** | | **~$130/month** |

Scale GKE to zero when not in use to save ~$97/month:

```bash
gcloud container clusters resize pulseq-cluster \
  --node-pool pulseq-nodes --num-nodes 0 \
  --region us-central1 --project $PROJECT_ID --quiet
```

---

## Teardown

```bash
kubectl delete all --all

cd infra
terraform destroy \
  -var="project_id=$PROJECT_ID" \
  -var="region=us-central1" \
  -var="db_password=your-password"

gcloud projects delete $PROJECT_ID
```

---

## Project structure

```
pulseq/
├── infra/                  Terraform — GKE, SQL, Pub/Sub, IAM, VPC
├── backend/                FastAPI multi-tenant API
│   └── app/
│       ├── main.py         Entry point, CORS
│       ├── auth.py         Firebase JWT verification
│       ├── models.py       Org, User (SQLAlchemy)
│       ├── database.py     Async PostgreSQL
│       └── routers/        auth, orgs, users, messages, health
├── consumer/               GKE worker pod (Pub/Sub subscriber)
├── manifests/              Kubernetes + KEDA manifests
├── frontend/               React dashboard (TypeScript)
├── scripts/                Bootstrap + message generator
└── .github/workflows/      Backend, consumer, frontend CI/CD
```

---

## Security

- Firebase JWT required on all endpoints except `/health`
- `org_id` enforced on every database query — no cross-tenant access possible
- GCP Workload Identity — no credential files in pods or CI/CD runners
- Cloud SQL private VPC — no public IP, accessible only via VPC connector
- Secrets in GCP Secret Manager — injected at runtime via `--set-secrets`
- CORS restricted to frontend domain only
- Branch protection on `main` — PRs required, force push blocked
- Dependabot watching pip, npm, docker, terraform, and GitHub Actions

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## License

MIT
