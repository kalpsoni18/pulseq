"""
PulseQ Consumer
---------------
Runs inside GKE pods. KEDA scales replicas 0→10 based on
how many unacked messages are in the Pub/Sub subscription.

Each pod:
  1. Subscribes to the org's Pub/Sub subscription
  2. Processes (prints) each message and acks it
  3. Loops forever until the pod is terminated by KEDA scale-down
"""
import os
import time
import signal
import logging
from concurrent.futures import TimeoutError
from google.cloud import pubsub_v1

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("pulseq-consumer")

PROJECT_ID = os.environ["PUBSUB_PROJECT"]
SUBSCRIPTION_NAME = os.environ["PUBSUB_SUBSCRIPTION"]
PULL_TIMEOUT = float(os.environ.get("PULL_TIMEOUT", "5.0"))

# Graceful shutdown flag
_shutdown = False


def handle_sigterm(sig, frame):
    global _shutdown
    log.info("SIGTERM received — draining and shutting down...")
    _shutdown = True


signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)


def process_message(message: pubsub_v1.subscriber.message.Message):
    org_id = message.attributes.get("org_id", "unknown")
    sequence = message.attributes.get("sequence", "?")
    payload = message.data.decode("utf-8")

    log.info(
        "Processed message | org=%s seq=%s payload=%s msg_id=%s",
        org_id, sequence, payload, message.message_id,
    )
    message.ack()


def run():
    subscriber = pubsub_v1.SubscriberClient()
    subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_NAME)

    log.info("PulseQ consumer starting | subscription=%s", subscription_path)

    with subscriber:
        while not _shutdown:
            future = subscriber.subscribe(subscription_path, callback=process_message)
            try:
                future.result(timeout=PULL_TIMEOUT)
            except TimeoutError:
                future.cancel()
                future.result()  # wait for cancellation to complete
            except Exception as e:
                log.error("Subscriber error: %s", e)
                future.cancel()

            if not _shutdown:
                time.sleep(1)

    log.info("Consumer shut down cleanly.")


if __name__ == "__main__":
    run()
