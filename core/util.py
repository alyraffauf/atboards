"""Shared utilities."""

from datetime import datetime, timezone


def now_iso() -> str:
    """Current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def format_datetime_utc(value: str) -> str:
    """Format an ISO datetime string as UTC."""
    dt = datetime.fromisoformat(value)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def format_datetime_local(value: str) -> str:
    """Format an ISO datetime string in local timezone."""
    dt = datetime.fromisoformat(value).astimezone()
    return dt.strftime("%Y-%m-%d %H:%M")


def blob_url(pds: str, did: str, cid: str) -> str:
    """Construct an ATProto blob fetch URL."""
    return f"{pds}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}"


def attachment_cid(attachment: dict) -> str:
    """Return the blob CID from a post attachment, or empty string if missing."""
    return (attachment.get("file") or {}).get("ref", {}).get("$link", "")
