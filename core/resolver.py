import asyncio

import httpx

from core.models import (
    AtUri,
    BBS,
    Board,
    News,
    Site,
    BBSNotFoundError,
    NoBBSError,
    NetworkError,
)
from core import lexicon
from core.constellation import get_news
from core.slingshot import get_record, get_records_batch, resolve_identity


async def resolve_bbs(client: httpx.AsyncClient, handle: str) -> BBS:
    """Handle -> fully resolved BBS config."""
    try:
        identity = await resolve_identity(client, handle)
    except httpx.HTTPStatusError:
        raise BBSNotFoundError(f"Could not resolve handle: {handle}")
    except httpx.TransportError:
        raise NetworkError("Could not reach the network.")

    try:
        site_record = await get_record(
            client, identity.did, lexicon.SITE, "self"
        )
    except httpx.HTTPStatusError:
        raise NoBBSError(f"{handle} isn't running a BBS.")
    except httpx.TransportError:
        raise NetworkError("Could not reach the network.")

    sv = site_record.value
    site_uri = str(AtUri(identity.did, lexicon.SITE, "self"))

    # Fetch boards and news backlinks concurrently
    board_slugs = sv["boards"]
    board_tasks = [
        get_record(client, identity.did, lexicon.BOARD, slug)
        for slug in board_slugs
    ]
    news_task = get_news(client, site_uri)

    results = await asyncio.gather(*board_tasks, news_task, return_exceptions=True)
    board_records = results[:-1]
    news_result = results[-1]

    boards = [
        Board(
            slug=slug,
            name=r.value["name"],
            description=r.value["description"],
            created_at=r.value["createdAt"],
            updated_at=r.value.get("updatedAt"),
        )
        for slug, r in zip(board_slugs, board_records)
        if not isinstance(r, BaseException)
    ]

    # Hydrate news records (only from the sysop's repo)
    if isinstance(news_result, BaseException):
        news_records = []
    else:
        sysop_news = [r for r in news_result.records if r.did == identity.did]
        news_records = await get_records_batch(client, sysop_news)
    news = [
        News(
            tid=AtUri.parse(r.uri).rkey,
            site_uri=r.value["site"],
            title=r.value["title"],
            body=r.value["body"],
            created_at=r.value["createdAt"],
        )
        for r in news_records
    ]
    news.sort(key=lambda n: n.created_at, reverse=True)

    site = Site(
        name=sv["name"],
        description=sv["description"],
        intro=sv["intro"],
        boards=boards,
        banned_dids=set(sv.get("bannedDids", [])),
        hidden_posts=set(sv.get("hiddenPosts", [])),
        created_at=sv.get("createdAt", ""),
        updated_at=sv.get("updatedAt"),
    )

    return BBS(identity=identity, site=site, news=news)
