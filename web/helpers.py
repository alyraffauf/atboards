"""Shared web route helpers."""

from quart import current_app, session

from core.auth.session import SessionStore


async def get_user() -> dict | None:
    """Get the current logged-in user's OAuth session."""
    did = session.get("did")
    if not did:
        return None
    store: SessionStore = current_app.session_store
    return store.get_session(did)


async def session_updater(did: str, field: str, value: str):
    """Callback for pds_request to persist nonce updates."""
    store: SessionStore = current_app.session_store
    store.update_session_field(did, field, value)
