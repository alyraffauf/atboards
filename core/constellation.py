import httpx

from core.models import BacklinkRef, BacklinksResponse

BASE_URL = "https://constellation.microcosm.blue/xrpc"


async def get_backlinks(
    client: httpx.AsyncClient,
    subject: str,
    source: str,
    limit: int = 50,
    cursor: str | None = None,
) -> BacklinksResponse:
    """Query Constellation for records that link to a subject."""
    params: dict[str, str | int] = {
        "subject": subject,
        "source": source,
        "limit": limit,
    }
    if cursor is not None:
        params["cursor"] = cursor
    resp = await client.get(
        f"{BASE_URL}/blue.microcosm.links.getBacklinks",
        params=params,
    )
    resp.raise_for_status()
    data = resp.json()
    return BacklinksResponse(
        total=data["total"],
        records=[
            BacklinkRef(did=r["did"], collection=r["collection"], rkey=r["rkey"])
            for r in data["records"]
        ],
        cursor=data.get("cursor"),
    )


async def get_threads(
    client: httpx.AsyncClient,
    board_uri: str,
    limit: int = 50,
    cursor: str | None = None,
) -> BacklinksResponse:
    """Get threads pointing at a board."""
    return await get_backlinks(
        client, subject=board_uri, source="xyz.atboards.thread:board",
        limit=limit, cursor=cursor,
    )


async def get_news(
    client: httpx.AsyncClient,
    site_uri: str,
    limit: int = 50,
    cursor: str | None = None,
) -> BacklinksResponse:
    """Get news posts pointing at a site."""
    return await get_backlinks(
        client, subject=site_uri, source="xyz.atboards.news:site",
        limit=limit, cursor=cursor,
    )


async def get_replies(
    client: httpx.AsyncClient,
    thread_uri: str,
    limit: int = 50,
    cursor: str | None = None,
) -> BacklinksResponse:
    """Get replies pointing at a thread."""
    return await get_backlinks(
        client, subject=thread_uri, source="xyz.atboards.reply:subject",
        limit=limit, cursor=cursor,
    )
