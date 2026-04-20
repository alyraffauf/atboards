"""TUI utilities."""

from core.auth.session import SessionStore
from core.models import AuthError, BBS
from core.records import create_ban_record, create_hidden_record
from core.resolver import invalidate_bbs_cache


def require_session(screen) -> dict | None:
    """Return the user session if logged in, else notify and return None."""
    session = screen.app.user_session
    if not session:
        screen.notify("You must be logged in to do that.", severity="error")
        return None
    return session


def require_sysop(screen, bbs: BBS) -> dict | None:
    """Return the user session if logged in AND is the BBS sysop.

    Shows an error notification and returns None otherwise.
    """
    session = screen.app.user_session
    if not session:
        screen.notify("You must be logged in to do that.", severity="error")
        return None
    if session["did"] != bbs.identity.did:
        screen.notify("Only the sysop can do that.", severity="error")
        return None
    return session


def make_session_updater(store: SessionStore):
    """Create a session_updater callback for PDS write operations."""

    async def updater(did: str, field: str, value: str):
        store.update_session_field(did, field, value)

    return updater


async def ban_user(screen, did: str) -> bool:
    """Ban a user by DID. Returns True on success, False on failure.

    Handles the full workflow: create ban record, invalidate cache,
    and show a success or error notification.
    """
    session = screen.app.user_session
    updater = make_session_updater(screen.app.session_store)
    try:
        await create_ban_record(screen.app.http_client, session, did, updater)
        invalidate_bbs_cache()
        screen.notify(f"Banned {did}.")
        return True
    except AuthError:
        screen.notify("Session expired. Please log in again.", severity="error")
        return False
    except Exception:
        screen.notify("Could not ban user.", severity="error")
        return False


async def hide_post(screen, uri: str) -> bool:
    """Hide a post by AT-URI. Returns True on success, False on failure.

    Handles the full workflow: create hidden record, invalidate cache,
    and show a success or error notification.
    """
    session = screen.app.user_session
    updater = make_session_updater(screen.app.session_store)
    try:
        await create_hidden_record(screen.app.http_client, session, uri, updater)
        invalidate_bbs_cache()
        screen.notify("Post hidden.")
        return True
    except AuthError:
        screen.notify("Session expired. Please log in again.", severity="error")
        return False
    except Exception:
        screen.notify("Could not hide post.", severity="error")
        return False
