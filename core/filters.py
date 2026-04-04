from core.models import Record


def filter_moderated(records: list[Record], banned_dids: set[str], hidden_posts: set[str]) -> list[Record]:
    """Remove records from banned users or hidden by the sysop."""
    return [
        r for r in records
        if r.uri.split("/")[2] not in banned_dids and r.uri not in hidden_posts
    ]
