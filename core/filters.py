from core.models import Record


def filter_banned(records: list[Record], banned_dids: set[str]) -> list[Record]:
    """Remove records authored by banned DIDs."""
    return [r for r in records if r.uri.split("/")[2] not in banned_dids]
