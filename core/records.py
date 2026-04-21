"""Shared record operations — create, delete, hydrate.

Framework-agnostic. Used by both web and TUI.
"""

from dataclasses import dataclass

import httpx

from core import lexicon
from core.constellation import get_board_activity, get_replies, get_root_posts
from core.filters import filter_moderated
from core.models import AtUri, AuthError, BBS, Board, MiniDoc, Post, Record
from core.slingshot import (
    get_records_batch,
    get_records_by_uri,
    resolve_identities_batch,
)
from core.util import now_iso


def post_from_record(record: Record, author: MiniDoc) -> Post:
    """Construct a Post from a raw Record and resolved author."""
    return Post(
        uri=record.uri,
        scope=record.value.get("scope", ""),
        body=record.value.get("body", ""),
        created_at=record.value.get("createdAt", ""),
        author=author,
        title=record.value.get("title"),
        root=record.value.get("root"),
        parent=record.value.get("parent"),
        updated_at=record.value.get("updatedAt"),
        attachments=record.value.get("attachments"),
    )


async def hydrate_threads(
    client: httpx.AsyncClient,
    bbs: BBS,
    board: Board,
    banned_dids: set[str] | None = None,
    hidden_posts: set[str] | None = None,
    cursor: str | None = None,
    page_size: int = 25,
) -> tuple[list[Post], str | None]:
    """Fetch threads for a board, sorted by last activity (bump order).

    Scans recent board activity (threads + replies) and collects unique
    thread URIs in the order they appear. Since Constellation returns
    newest posts first, the first time a thread URI appears is its most
    recent activity — giving us bump order naturally.
    """
    board_uri = str(AtUri(bbs.identity.did, lexicon.BOARD, board.slug))
    max_scans = 4

    # Phase 1: Scan board activity to find unique thread URIs
    # Keys are thread URIs, values are the timestamp of their last activity.
    last_activity: dict[str, str] = {}
    scan_cursor = cursor

    for scan in range(max_scans):
        if len(last_activity) >= page_size:
            break

        backlinks = await get_board_activity(client, board_uri, cursor=scan_cursor)
        if not backlinks.records:
            break

        records = await get_records_batch(client, backlinks.records)
        if banned_dids or hidden_posts:
            records = filter_moderated(
                records, banned_dids or set(), hidden_posts or set()
            )

        for record in records:
            thread_uri = record.value.get("root") or record.uri
            if thread_uri not in last_activity:
                last_activity[thread_uri] = record.value.get("createdAt", "")

        scan_cursor = backlinks.cursor
        if not scan_cursor:
            break

    # Phase 2: Fetch root post records for the thread URIs
    thread_uris = list(last_activity.keys())[:page_size]
    root_records = await get_records_by_uri(client, thread_uris)
    root_records = [record for record in root_records if not record.value.get("root")]
    if banned_dids or hidden_posts:
        root_records = filter_moderated(
            root_records, banned_dids or set(), hidden_posts or set()
        )

    # Phase 3: Resolve authors and build Post objects
    uri_to_did = {record.uri: AtUri.parse(record.uri).did for record in root_records}
    authors = await resolve_identities_batch(client, list(uri_to_did.values()))

    threads = [
        post_from_record(record, authors[uri_to_did[record.uri]])
        for record in root_records
        if uri_to_did[record.uri] in authors
    ]

    # Set last_activity_at and sort by it (bump order)
    for thread in threads:
        thread.last_activity_at = last_activity.get(thread.uri, thread.created_at)
    threads.sort(
        key=lambda thread: thread.last_activity_at or thread.created_at, reverse=True
    )

    return threads, scan_cursor


@dataclass
class RepliesPage:
    """A page of hydrated replies with pagination info."""

    replies: list[Post]
    page: int
    total_pages: int
    total_replies: int


async def hydrate_replies(
    client: httpx.AsyncClient,
    bbs: BBS,
    root_uri: str,
    banned_dids: set[str] | None = None,
    hidden_posts: set[str] | None = None,
    page: int = 1,
    page_size: int = 10,
    focus_reply: str | None = None,
) -> RepliesPage:
    """Fetch all reply refs, then hydrate only the requested page (oldest first).

    If focus_reply is provided (an AT URI), automatically jump to the page
    containing that reply.
    """
    # Fetch all refs (cheap — just did/collection/rkey)
    backlinks = await get_replies(client, root_uri, limit=1000)
    all_refs = list(reversed(backlinks.records))  # oldest first

    total = len(all_refs)
    total_pages = max(1, (total + page_size - 1) // page_size)

    # If a specific reply is requested, find its page
    if focus_reply:
        for i, ref in enumerate(all_refs):
            if f"at://{ref.did}/{ref.collection}/{ref.rkey}" == focus_reply:
                page = (i // page_size) + 1
                break

    page = max(1, min(page, total_pages))

    # Slice the page we need
    start = (page - 1) * page_size
    page_refs = all_refs[start : start + page_size]

    if not page_refs:
        return RepliesPage(
            replies=[], page=page, total_pages=total_pages, total_replies=total
        )

    # Hydrate only this page
    records = await get_records_batch(client, page_refs)
    if banned_dids or hidden_posts:
        records = filter_moderated(records, banned_dids or set(), hidden_posts or set())

    parsed = {record.uri: AtUri.parse(record.uri) for record in records}
    dids = [parsed_uri.did for parsed_uri in parsed.values()]
    authors = await resolve_identities_batch(client, dids)

    replies = [
        post_from_record(record, authors[parsed[record.uri].did])
        for record in records
        if parsed[record.uri].did in authors
    ]
    replies.sort(key=lambda reply: reply.created_at)
    return RepliesPage(
        replies=replies, page=page, total_pages=total_pages, total_replies=total
    )


async def _try_refresh_token(client, session, session_updater):
    """Attempt to refresh an expired OAuth token. Updates session in place."""
    if not session.get("dpop_private_jwk") or not session.get("refresh_token"):
        return False
    try:
        import json
        import os

        from core.auth.config import load_secrets
        from core.auth.oauth import refresh_tokens

        data_dir = os.environ.get("ATBBS_DATA_DIR")
        if not data_dir:
            from platformdirs import user_data_dir

            data_dir = user_data_dir("atbbs")
        secrets = load_secrets(data_dir)
        client_secret_jwk = json.loads(secrets["client_secret_jwk"])

        # Use stored client_id — required for token refresh
        client_id = session.get("client_id")
        if not client_id:
            return False

        token_resp, dpop_nonce = await refresh_tokens(
            client=client,
            session=session,
            client_id=client_id,
            client_secret_jwk=client_secret_jwk,
        )

        session["access_token"] = token_resp["access_token"]
        if "refresh_token" in token_resp:
            session["refresh_token"] = token_resp["refresh_token"]
        session["dpop_authserver_nonce"] = dpop_nonce

        async def _noop(*a):
            pass

        updater = session_updater or _noop
        await updater(session["did"], "access_token", session["access_token"])
        await updater(session["did"], "refresh_token", session["refresh_token"])
        await updater(session["did"], "dpop_authserver_nonce", dpop_nonce)
        return True
    except Exception:
        return False


async def pds_post(
    client: httpx.AsyncClient,
    session: dict,
    endpoint: str,
    body: dict,
    session_updater=None,
) -> httpx.Response:
    """POST to a user's PDS, using DPoP if available, Bearer otherwise. Refreshes tokens on 401."""
    url = f"{session['pds_url']}/xrpc/{endpoint}"

    if "dpop_private_jwk" in session and session["dpop_private_jwk"]:
        from core.auth.oauth import pds_request

        async def _noop(*a):
            pass

        updater = session_updater or _noop
        resp = await pds_request(client, "POST", url, session, updater, body=body)

        if resp.status_code == 401:
            if await _try_refresh_token(client, session, session_updater):
                resp = await pds_request(
                    client, "POST", url, session, updater, body=body
                )
            else:
                raise AuthError("Session expired. Please log in again.")

        return resp

    resp = await client.post(
        url,
        headers={"Authorization": f"Bearer {session['access_token']}"},
        json=body,
    )
    return resp


async def upload_blob(
    client: httpx.AsyncClient,
    session: dict,
    data: bytes,
    mime_type: str,
    session_updater=None,
) -> dict:
    """Upload a blob to the user's PDS. Returns the blob ref."""
    url = f"{session['pds_url']}/xrpc/com.atproto.repo.uploadBlob"

    if "dpop_private_jwk" in session and session["dpop_private_jwk"]:
        from core.auth.oauth import pds_request

        async def _noop(*a):
            pass

        updater = session_updater or _noop
        resp = await pds_request(
            client,
            "POST",
            url,
            session,
            updater,
            content=data,
            content_type=mime_type,
        )

        if resp.status_code == 401:
            if await _try_refresh_token(client, session, session_updater):
                resp = await pds_request(
                    client,
                    "POST",
                    url,
                    session,
                    updater,
                    content=data,
                    content_type=mime_type,
                )
            else:
                raise AuthError("Session expired. Please log in again.")
    else:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {session['access_token']}",
                "Content-Type": mime_type,
            },
            content=data,
        )

    resp.raise_for_status()
    return resp.json()["blob"]


async def create_post_record(
    client: httpx.AsyncClient,
    session: dict,
    scope: str,
    body: str,
    title: str | None = None,
    root: str | None = None,
    parent: str | None = None,
    attachments: list[dict] | None = None,
    session_updater=None,
) -> httpx.Response:
    """Create a post record in the user's repo."""
    record: dict = {
        "$type": lexicon.POST,
        "scope": scope,
        "body": body,
        "createdAt": now_iso(),
    }
    if title:
        record["title"] = title
    if root:
        record["root"] = root
    if parent:
        record["parent"] = parent
    if attachments:
        record["attachments"] = attachments
    return await pds_post(
        client,
        session,
        "com.atproto.repo.createRecord",
        {
            "repo": session["did"],
            "collection": lexicon.POST,
            "record": record,
        },
        session_updater,
    )


async def delete_record(
    client: httpx.AsyncClient,
    session: dict,
    collection: str,
    rkey: str,
    session_updater=None,
) -> httpx.Response:
    """Delete a record from the user's repo."""
    resp = await pds_post(
        client,
        session,
        "com.atproto.repo.deleteRecord",
        {
            "repo": session["did"],
            "collection": collection,
            "rkey": rkey,
        },
        session_updater,
    )
    resp.raise_for_status()
    return resp


async def list_pds_records(
    client: httpx.AsyncClient,
    pds_url: str,
    did: str,
    collection: str,
    limit: int = 100,
) -> list[dict]:
    """Fetch all records of a collection from a PDS via listRecords."""
    records = []
    cursor = None
    while True:
        params = {"repo": did, "collection": collection, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        resp = await client.get(
            f"{pds_url}/xrpc/com.atproto.repo.listRecords", params=params
        )
        resp.raise_for_status()
        data = resp.json()
        records.extend(data.get("records", []))
        cursor = data.get("cursor")
        if not cursor:
            break
    return records


async def create_ban_record(
    client: httpx.AsyncClient,
    session: dict,
    banned_did: str,
    session_updater=None,
) -> httpx.Response:
    """Create a ban record in the sysop's repo."""
    return await pds_post(
        client,
        session,
        "com.atproto.repo.createRecord",
        {
            "repo": session["did"],
            "collection": lexicon.BAN,
            "record": {
                "$type": lexicon.BAN,
                "did": banned_did,
                "createdAt": now_iso(),
            },
        },
        session_updater,
    )


async def create_hidden_record(
    client: httpx.AsyncClient,
    session: dict,
    post_uri: str,
    session_updater=None,
) -> httpx.Response:
    """Create a hidden post record in the sysop's repo."""
    return await pds_post(
        client,
        session,
        "com.atproto.repo.createRecord",
        {
            "repo": session["did"],
            "collection": lexicon.HIDE,
            "record": {
                "$type": lexicon.HIDE,
                "uri": post_uri,
                "createdAt": now_iso(),
            },
        },
        session_updater,
    )


async def put_board_record(
    client: httpx.AsyncClient,
    session: dict,
    slug: str,
    name: str,
    description: str,
    created_at: str,
    session_updater=None,
) -> httpx.Response:
    """Create or update a board record in the user's repo."""
    return await pds_post(
        client,
        session,
        "com.atproto.repo.putRecord",
        {
            "repo": session["did"],
            "collection": lexicon.BOARD,
            "rkey": slug,
            "record": {
                "$type": lexicon.BOARD,
                "name": name,
                "description": description,
                "createdAt": created_at,
            },
        },
        session_updater,
    )


async def put_site_record(
    client: httpx.AsyncClient,
    session: dict,
    site_value: dict,
    session_updater=None,
) -> httpx.Response:
    """Create or update the site record in the user's repo."""
    return await pds_post(
        client,
        session,
        "com.atproto.repo.putRecord",
        {
            "repo": session["did"],
            "collection": lexicon.SITE,
            "rkey": "self",
            "record": site_value,
        },
        session_updater,
    )


async def fetch_inbox(
    client: httpx.AsyncClient,
    did: str,
    pds_url: str,
    max_items: int = 50,
) -> list[dict]:
    """Fetch inbox: replies to user's root posts and replies to user's replies."""
    import asyncio

    from core.constellation import get_backlinks

    SCAN_LIMIT = 50  # how many posts to scan
    BACKLINK_LIMIT = 50  # backlinks per record
    MAX_CONCURRENT = 10  # concurrent API calls

    sem = asyncio.Semaphore(MAX_CONCURRENT)

    # Fetch user's posts
    try:
        resp = await client.get(
            f"{pds_url}/xrpc/com.atproto.repo.listRecords",
            params={"repo": did, "collection": lexicon.POST, "limit": SCAN_LIMIT},
        )
        resp.raise_for_status()
        all_posts = resp.json().get("records", [])
    except Exception:
        all_posts = []

    root_posts = [post for post in all_posts if "root" not in post["value"]]
    reply_posts = [post for post in all_posts if "root" in post["value"]]

    # Batch-resolve BBS handles for all root posts at once
    bbs_dids = set()
    for root_post in root_posts:
        scope = root_post["value"].get("scope", "")
        if scope:
            bbs_dids.add(AtUri.parse(scope).did)
    try:
        bbs_authors = (
            await resolve_identities_batch(client, list(bbs_dids)) if bbs_dids else {}
        )
    except Exception:
        bbs_authors = {}

    # 1. Fetch replies to user's root posts (concurrent)
    async def fetch_post_replies(root_post):
        async with sem:
            post_uri = root_post["uri"]
            post_title = root_post["value"].get("title", "")
            scope = root_post["value"].get("scope", "")
            bbs_did = AtUri.parse(scope).did if scope else did
            bbs_handle = bbs_authors[bbs_did].handle if bbs_did in bbs_authors else ""

            try:
                backlinks = await get_replies(client, post_uri, limit=BACKLINK_LIMIT)
                records = await get_records_batch(client, backlinks.records)
                parsed = {record.uri: AtUri.parse(record.uri) for record in records}
                records = [
                    record for record in records if parsed[record.uri].did != did
                ]
                if not records:
                    return []

                dids = [parsed[record.uri].did for record in records]
                authors = await resolve_identities_batch(client, dids)

                items = []
                for record in records:
                    author_did = parsed[record.uri].did
                    if author_did not in authors:
                        continue
                    items.append(
                        {
                            "type": "reply",
                            "reply_uri": record.uri,
                            "thread_title": post_title,
                            "thread_uri": post_uri,
                            "handle": authors[author_did].handle,
                            "body": record.value.get("body", "")[:200],
                            "created_at": record.value.get("createdAt", ""),
                            "bbs_handle": bbs_handle,
                        }
                    )
                return items
            except Exception:
                return []

    # 2. Fetch replies that reference user's replies as parent (concurrent)
    async def fetch_child_replies(reply_post):
        async with sem:
            reply_uri = reply_post["uri"]
            root_uri = reply_post["value"].get("root", "")
            try:
                backlinks = await get_backlinks(
                    client,
                    subject=reply_uri,
                    source=f"{lexicon.POST}:parent",
                    limit=BACKLINK_LIMIT,
                )
                if not backlinks.records:
                    return []

                records = await get_records_batch(client, backlinks.records)
                parsed = {record.uri: AtUri.parse(record.uri) for record in records}
                records = [
                    record for record in records if parsed[record.uri].did != did
                ]
                if not records:
                    return []

                dids = [parsed[record.uri].did for record in records]
                authors = await resolve_identities_batch(client, dids)

                items = []
                for record in records:
                    author_did = parsed[record.uri].did
                    if author_did not in authors:
                        continue
                    items.append(
                        {
                            "type": "parent_reply",
                            "reply_uri": record.uri,
                            "thread_title": "",
                            "thread_uri": root_uri,
                            "handle": authors[author_did].handle,
                            "body": record.value.get("body", "")[:200],
                            "created_at": record.value.get("createdAt", ""),
                            "bbs_handle": "",
                        }
                    )
                return items
            except Exception:
                return []

    # Run all lookups concurrently
    results = await asyncio.gather(
        *[fetch_post_replies(root_post) for root_post in root_posts],
        *[fetch_child_replies(reply_post) for reply_post in reply_posts],
    )

    all_items = []
    for items in results:
        all_items.extend(items)

    # Deduplicate and prefer parent-reply type if same record appears in both
    seen = {}
    for item in all_items:
        key = item["handle"] + item["body"] + item["created_at"]
        if key in seen:
            if item["type"] == "parent_reply":
                seen[key] = item
        else:
            seen[key] = item

    deduped = list(seen.values())
    deduped.sort(key=lambda item: item["created_at"], reverse=True)
    return deduped
