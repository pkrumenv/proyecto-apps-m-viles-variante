import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, insert, select, union
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.retry import run_transaction_with_retry
from app.db.schema import push_subscriptions, restaurant_follows, restaurants, user_follows
from app.db.session import engine

logger = logging.getLogger(__name__)


class PushStoreError(Exception):
    """Push subscription metadata could not be persisted or queried."""


class PushNotConfiguredError(Exception):
    """VAPID keys are not configured on this deployment."""


@dataclass(frozen=True)
class PushSubscription:
    id: UUID
    user_id: UUID
    endpoint: str
    p256dh: str
    auth: str
    created_at: datetime


def save_subscription(
    *, user_id: UUID, endpoint: str, p256dh: str, auth: str
) -> PushSubscription:
    """Create or refresh a subscription, keyed by its unique endpoint.

    A given browser/device endpoint is only ever associated with the most
    recently authenticated user (relogging in as someone else on the same
    browser must not keep sending that browser the previous user's pushes).
    """
    subscription_id = uuid4()
    timestamp = datetime.now(UTC)

    def persist(connection):
        connection.execute(
            delete(push_subscriptions).where(push_subscriptions.c.endpoint == endpoint)
        )
        connection.execute(
            insert(push_subscriptions).values(
                id=subscription_id,
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                created_at=timestamp,
            )
        )

    try:
        run_transaction_with_retry(engine, persist)
    except SQLAlchemyError as error:
        raise PushStoreError from error

    return PushSubscription(
        id=subscription_id,
        user_id=user_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        created_at=timestamp,
    )


def delete_subscription(*, user_id: UUID, endpoint: str) -> None:
    """Remove a subscription. Scoped to user_id so one user can't drop another's."""

    def persist(connection):
        connection.execute(
            delete(push_subscriptions).where(
                push_subscriptions.c.endpoint == endpoint,
                push_subscriptions.c.user_id == user_id,
            )
        )

    try:
        run_transaction_with_retry(engine, persist)
    except SQLAlchemyError as error:
        raise PushStoreError from error


def _delete_subscription_by_endpoint(endpoint: str) -> None:
    """Drop a subscription regardless of owner (used for expired endpoints)."""

    def persist(connection):
        connection.execute(delete(push_subscriptions).where(push_subscriptions.c.endpoint == endpoint))

    try:
        run_transaction_with_retry(engine, persist)
    except SQLAlchemyError:
        logger.exception("Could not remove expired push subscription")


def _subscriptions_for_interested_users(*, author_id: UUID, restaurant_id: UUID, exclude_user_id: UUID):
    """Subscriptions of everyone who would see this review in their feed.

    Mirrors services/feed.py's visibility rule: people who follow the
    review's author, or who follow the restaurant, minus the author
    themselves (no self-notifications).
    """
    interested_user_ids = union(
        select(user_follows.c.follower_id).where(user_follows.c.followed_id == author_id),
        select(restaurant_follows.c.user_id).where(
            restaurant_follows.c.restaurant_id == restaurant_id
        ),
    )
    statement = select(push_subscriptions).where(
        push_subscriptions.c.user_id.in_(interested_user_ids),
        push_subscriptions.c.user_id != exclude_user_id,
    )
    with engine.connect() as connection:
        return connection.execute(statement).mappings().all()


def _restaurant_name(restaurant_id: UUID) -> str | None:
    statement = select(restaurants.c.name).where(restaurants.c.id == restaurant_id)
    with engine.connect() as connection:
        return connection.scalar(statement)


def notify_review_created(
    *,
    review_id: UUID,
    author_id: UUID,
    author_name: str,
    restaurant_id: UUID,
    dish_name: str,
) -> None:
    """Best-effort push fan-out after a review is published.

    Notification delivery is never allowed to fail review creation: every
    error here is logged and swallowed by the caller's perspective (this
    function itself raises nothing except PushNotConfiguredError, which the
    caller is expected to catch too).
    """
    if not settings.vapid_public_key or not settings.vapid_private_key:
        raise PushNotConfiguredError

    try:
        subscriptions = _subscriptions_for_interested_users(
            author_id=author_id, restaurant_id=restaurant_id, exclude_user_id=author_id
        )
        if not subscriptions:
            return
        restaurant_name = _restaurant_name(restaurant_id) or "un restaurante"
    except SQLAlchemyError:
        logger.exception("Could not look up push data for review %s", review_id)
        return

    payload = json.dumps(
        {
            "title": f"{author_name} publicó una reseña",
            "body": f"{dish_name} en {restaurant_name}",
            "url": f"/#review/{review_id}",
        }
    )

    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription["endpoint"],
                    "keys": {
                        "p256dh": subscription["p256dh"],
                        "auth": subscription["auth"],
                    },
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
        except WebPushException as error:
            status_code = getattr(error.response, "status_code", None)
            if status_code in (404, 410):
                # The push service confirms this endpoint no longer exists.
                _delete_subscription_by_endpoint(subscription["endpoint"])
            else:
                logger.warning("Push delivery failed for review %s: %s", review_id, error)
        except Exception:
            logger.exception("Unexpected error delivering push for review %s", review_id)