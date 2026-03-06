"""
Webhook endpoints for async tool callbacks.
Currently handles Manus task completion notifications.
"""

from fastapi import APIRouter, Request, HTTPException
import hmac
import hashlib

from ..config import settings

router = APIRouter()


@router.post("/manus")
async def manus_webhook(request: Request):
    """
    Receive Manus task completion webhook.
    Verifies signature and stores result for polling.
    """
    body = await request.body()

    # Verify webhook signature if secret is configured
    if settings.manus_webhook_secret:
        signature = request.headers.get("X-Manus-Signature", "")
        expected = hmac.new(
            settings.manus_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(f"sha256={expected}", signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    data = await request.json()
    task_id = data.get("task_id")
    status = data.get("status")

    # TODO: store result in Redis/DB for retrieval
    # For now, just acknowledge
    return {"received": True, "task_id": task_id, "status": status}
