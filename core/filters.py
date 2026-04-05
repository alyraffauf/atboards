from core import lexicon
from core.models import AtUri, Record


def filter_moderated(
    records: list[Record], banned_dids: set[str], hidden_posts: set[str]
) -> list[Record]:
    """Remove records from banned users or hidden by the sysop."""
    return [
        r
        for r in records
        if AtUri.parse(r.uri).did not in banned_dids and r.uri not in hidden_posts
    ]
