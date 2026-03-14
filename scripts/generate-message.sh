#!/bin/bash
# ─────────────────────────────────────────────────────────────
# PulseQ — Message burst generator
# Publishes N messages to a Pub/Sub topic to trigger KEDA scaling
#
# Usage:
#   ./scripts/generate-message.sh                  # default: 30 messages, 1/sec
#   COUNT=50 DELAY=0.5 ./scripts/generate-message.sh
#   TOPIC=pulseq-demo-topic ./scripts/generate-message.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

source "$(dirname "$0")/../.env" 2>/dev/null || true

TOPIC="${TOPIC:-pulseq-demo-topic}"
COUNT="${COUNT:-30}"
DELAY="${DELAY:-1}"

echo ""
echo "PulseQ Burst Generator"
echo "  Project:  ${PROJECT_ID}"
echo "  Topic:    ${TOPIC}"
echo "  Messages: ${COUNT}"
echo "  Delay:    ${DELAY}s between messages"
echo ""
echo "Watch replicas scale up with:"
echo "  kubectl get hpa -w"
echo ""

for i in $(seq 1 "$COUNT"); do
    MESSAGE="pulseq-msg-${i}-$(date +%s%N)"
    gcloud pubsub topics publish "$TOPIC" \
        --message "$MESSAGE" \
        --project "$PROJECT_ID" \
        --attribute "source=burst-script,sequence=${i}"
    echo "  Published [$i/$COUNT]: $MESSAGE"
    sleep "$DELAY"
done

echo ""
echo "Done! $COUNT messages published."
echo "KEDA should have scaled up — check: kubectl get pods -l app=pulseq-consumer"
