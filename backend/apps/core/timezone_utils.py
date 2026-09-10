# apps/core/timezone_utils.py
import zoneinfo
from datetime import datetime, date


def get_outlet_timezone(outlet=None, organisation=None) -> zoneinfo.ZoneInfo:
    """
    Returns the ZoneInfo timezone object for the given outlet or organisation.
    Falls back to 'Asia/Kolkata' if unconfigured or invalid.
    """
    tz_str = 'Asia/Kolkata'
    if outlet:
        tz_str = (
            getattr(outlet, 'timezone', None)
            or (getattr(outlet.organisation, 'timezone', None) if getattr(outlet, 'organisation', None) else None)
            or 'Asia/Kolkata'
        )
    elif organisation:
        tz_str = getattr(organisation, 'timezone', None) or 'Asia/Kolkata'

    try:
        return zoneinfo.ZoneInfo(tz_str)
    except Exception:
        return zoneinfo.ZoneInfo('Asia/Kolkata')


def to_outlet_business_date(dt, outlet=None, organisation=None) -> date | None:
    """
    Converts a UTC datetime timestamp to the outlet's local date.
    Strictly avoids plain .date() on UTC timestamps.
    """
    if dt is None:
        return None
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt

    tz = get_outlet_timezone(outlet, organisation)
    if timezone_is_naive := (dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None):
        # Assume UTC if naive
        import datetime as dt_module
        dt = dt.replace(tzinfo=dt_module.timezone.utc)

    return dt.astimezone(tz).date()
