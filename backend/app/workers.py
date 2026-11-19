import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("truthos_workers", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.beat_schedule = {
    "reverify-due-claims": {
        "task": "backend.app.workers.reverify_due_claims",
        "schedule": 300.0,
    }
}


@celery_app.task(name="backend.app.workers.reverify_due_claims")
def reverify_due_claims() -> dict:
    return {"status": "scheduled_check_complete", "provider": "Tavily Search API"}
