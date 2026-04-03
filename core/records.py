"""Shared record operations — create, delete, hydrate.

Framework-agnostic. Used by both web and TUI.
"""

import httpx

from core.constellation import get_replies, get_threads
from core.filters import filter_banned
from core.models import BBS, Board, Reply, Thread
from core.slingshot import get_records_batch, resolve_identities_batch
from core.util import now_iso


async def hydrate_threads(
    client: httpx.AsyncClient,
    bbs: BBS,
    board: Board,
    cursor: str | None = None,
) -> tuple[list[Thread], str | None]:
    """Fetch and hydrate threads for a board."""
    board_uri = f"at://{bbs.identity.did}/xyz.atboards.board/{board.slug}"
    backlinks = await get_threads(client, board_uri, cursor=cursor)
    records = await get_records_batch(client, backlinks.records)
    records = filter_banned(records, bbs.site.banned_dids)

    dids = [r.uri.split("/")[2] for r in records]
    authors = await resolve_identities_batch(client, dids)

    threads = [
        Thread(
            uri=r.uri,
            board_uri=r.value["board"],
            title=r.value["title"],
            body=r.value["body"],
            created_at=r.value["createdAt"],
            author=authors[r.uri.split("/")[2]],
            updated_at=r.value.get("updatedAt"),
        )
        for r in records
        if r.uri.split("/")[2] in authors
    ]
    threads.sort(key=lambda t: t.created_at, reverse=True)
    return threads, backlinks.cursor


async def hydrate_replies(
    client: httpx.AsyncClient,
    bbs: BBS,
    thread: Thread,
    cursor: str | None = None,
) -> tuple[list[Reply], str | None]:
    """Fetch and hydrate replies for a thread."""
    backlinks = await get_replies(client, thread.uri, cursor=cursor)
    records = await get_records_batch(client, backlinks.records)
    records = filter_banned(records, bbs.site.banned_dids)

    dids = [r.uri.split("/")[2] for r in records]
    authors = await resolve_identities_batch(client, dids)

    replies = [
        Reply(
            uri=r.uri,
            subject_uri=r.value["subject"],
            body=r.value["body"],
            created_at=r.value["createdAt"],
            author=authors[r.uri.split("/")[2]],
            updated_at=r.value.get("updatedAt"),
        )
        for r in records
        if r.uri.split("/")[2] in authors
    ]
    replies.sort(key=lambda t: t.created_at)
    return replies, backlinks.cursor


async def _pds_post(
    client: httpx.AsyncClient,
    session: dict,
    endpoint: str,
    body: dict,
    session_updater=None,
) -> httpx.Response:
    """POST to a user's PDS, using DPoP if available, Bearer otherwise."""
    url = f"{session['pds_url']}/xrpc/{endpoint}"

    if "dpop_private_jwk" in session and session["dpop_private_jwk"]:
        from core.auth.oauth import pds_request
        async def _noop(*a): pass
        updater = session_updater or _noop
        return await pds_request(client, "POST", url, session, updater, body=body)

    resp = await client.post(
        url,
        headers={"Authorization": f"Bearer {session['access_token']}"},
        json=body,
    )
    return resp


async def create_thread_record(
    client: httpx.AsyncClient,
    session: dict,
    board_uri: str,
    title: str,
    body: str,
    session_updater=None,
) -> httpx.Response:
    """Create a thread record in the user's repo."""
    return await _pds_post(client, session, "com.atproto.repo.createRecord", {
        "repo": session["did"],
        "collection": "xyz.atboards.thread",
        "record": {
            "$type": "xyz.atboards.thread",
            "board": board_uri,
            "title": title,
            "body": body,
            "createdAt": now_iso(),
        },
    }, session_updater)


async def create_reply_record(
    client: httpx.AsyncClient,
    session: dict,
    thread_uri: str,
    body: str,
    session_updater=None,
) -> httpx.Response:
    """Create a reply record in the user's repo."""
    return await _pds_post(client, session, "com.atproto.repo.createRecord", {
        "repo": session["did"],
        "collection": "xyz.atboards.reply",
        "record": {
            "$type": "xyz.atboards.reply",
            "subject": thread_uri,
            "body": body,
            "createdAt": now_iso(),
        },
    }, session_updater)


async def delete_record(
    client: httpx.AsyncClient,
    session: dict,
    collection: str,
    rkey: str,
    session_updater=None,
) -> httpx.Response:
    """Delete a record from the user's repo."""
    resp = await _pds_post(client, session, "com.atproto.repo.deleteRecord", {
        "repo": session["did"],
        "collection": collection,
        "rkey": rkey,
    }, session_updater)
    resp.raise_for_status()
    return resp
