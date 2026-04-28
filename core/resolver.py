import asyncio

import httpx

from core.models import (
    AtUri,
    BBS,
    Board,
    Post,
    Site,
    BBSNotFoundError,
    NoBBSError,
    NetworkError,
    make_at_uri,
)
from core import lexicon
from core.cache import TTLCache
from core.constellation import get_root_posts
from core.records import list_pds_records, post_from_record
from core.slingshot import get_record, get_records_batch, resolve_identity

_bbs_cache = TTLCache(ttl_seconds=300)  # 5 minutes


def invalidate_bbs_cache():
    _bbs_cache.clear()


async def resolve_bbs(client: httpx.AsyncClient, handle: str) -> BBS:
    cached = _bbs_cache.get(handle)
    if cached:
        return cached
    bbs = await _resolve_bbs(client, handle)
    _bbs_cache.set(handle, bbs)
    return bbs


async def _resolve_bbs(client: httpx.AsyncClient, handle: str) -> BBS:
    """Handle -> fully resolved BBS config."""
    try:
        identity = await resolve_identity(client, handle)
    except httpx.HTTPStatusError:
        raise BBSNotFoundError(f"Could not resolve handle: {handle}")
    except httpx.TransportError:
        raise NetworkError("Could not reach the network.")

    try:
        site_record = await get_record(client, identity.did, lexicon.SITE, "self")
    except httpx.HTTPStatusError:
        raise NoBBSError(f"{handle} isn't running a BBS.")
    except httpx.TransportError:
        raise NetworkError("Could not reach the network.")

    site_value = site_record.value
    site_uri = make_at_uri(identity.did, lexicon.SITE, "self")

    # Fetch boards and news concurrently
    board_uris = site_value["boards"]
    board_tasks = []
    for uri in board_uris:
        parsed = AtUri.parse(uri)
        board_tasks.append(
            get_record(client, parsed.did, parsed.collection, parsed.rkey)
        )
    news_task = get_root_posts(client, site_uri)

    results = await asyncio.gather(*board_tasks, news_task, return_exceptions=True)
    board_records = results[: len(board_uris)]
    news_result = results[len(board_uris)]

    boards = []
    for uri, record in zip(board_uris, board_records):
        if isinstance(record, BaseException):
            continue
        parsed = AtUri.parse(uri)
        boards.append(
            Board(
                slug=parsed.rkey,
                name=record.value["name"],
                description=record.value["description"],
                created_at=record.value["createdAt"],
                updated_at=record.value.get("updatedAt"),
            )
        )

    # Hydrate news posts (only from the sysop's repo)
    if isinstance(news_result, BaseException):
        news_records = []
    else:
        sysop_news = [ref for ref in news_result.records if ref.did == identity.did]
        news_records = await get_records_batch(client, sysop_news)
    news = [post_from_record(record, identity) for record in news_records]
    news.sort(key=lambda post: post.created_at, reverse=True)

    site = Site(
        name=site_value["name"],
        description=site_value["description"],
        intro=site_value["intro"],
        boards=boards,
        created_at=site_value.get("createdAt", ""),
        updated_at=site_value.get("updatedAt"),
    )

    return BBS(identity=identity, site=site, news=news)
