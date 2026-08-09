"""Malaysia timezone helpers (UTC+8, no DST).

The database stores TIMESTAMPTZ values in UTC; every display/wall-clock string
should be rendered in Malaysia time.
"""

from datetime import datetime, timedelta, timezone

MALAYSIA_TZ = timezone(timedelta(hours=8), name="Asia/Kuala_Lumpur")


def now_malaysia() -> datetime:
    """Current time in Malaysia timezone."""
    return datetime.now(MALAYSIA_TZ)


def to_malaysia(value):
    """Convert a datetime (aware or naive) to Malaysia timezone.

    Naive datetimes are assumed to already be Malaysia wall-clock time.
    """
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=MALAYSIA_TZ)
        return value.astimezone(MALAYSIA_TZ)
    return value
