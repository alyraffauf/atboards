"""TUI utilities — delegates to core."""

from core.util import format_datetime_local as format_datetime


def require_session(screen) -> dict | None:
    """Return the user session if logged in and not banned, else notify and return None."""
    session = screen.app.user_session
    if not session:
        screen.notify("You must be logged in to do that.", severity="error")
        return None
    if screen.bbs.site.is_banned(session["did"]):
        screen.notify("You have been banned from this BBS.", severity="error")
        return None
    return session
