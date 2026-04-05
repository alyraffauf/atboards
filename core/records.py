"""Shared record operations — create, delete, hydrate.

Framework-agnostic. Used by both web and TUI.
"""

import httpx

from core import lexicon
from core.constellation import get_replies, get_threads
from core.filters import filter_moderated
from core.models import AtUri, BBS, Board, Reply, Thread
from core.slingshot import get_records_batch, resolve_identities_batch
from core.util import now_iso


async def hydrate_threads(
    client: httpx.AsyncClient,
    bbs: BBS,
    board: Board,
    cursor: str | None = None,
) -> tuple[list[Thread], str | None]:
    """Fetch and hydrate threads for a board."""
    board_uri = str(AtUri(bbs.identity.did, lexicon.BOARD, board.slug))
    backlinks = await get_threads(client, board_uri, cursor=cursor)
    records = await get_records_batch(client, backlinks.records)
    records = filter_moderated(records, bbs.site.banned_dids, bbs.site.hidden_posts)

    parsed = {r.uri: AtUri.parse(r.uri) for r in records}
    dids = [p.did for p in parsed.values()]
    authors = await resolve_identities_batch(client, dids)

    threads = [
        Thread(
            uri=r.uri,
            board_uri=r.value["board"],
            title=r.value["title"],
            body=r.value["body"],
            created_at=r.value["createdAt"],
            author=authors[parsed[r.uri].did],
            updated_at=r.value.get("updatedAt"),
            attachments=r.value.get("attachments"),
        )
        for r in records
        if parsed[r.uri].did in authors
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
    records = filter_moderated(records, bbs.site.banned_dids, bbs.site.hidden_posts)

    parsed = {r.uri: AtUri.parse(r.uri) for r in records}
    dids = [p.did for p in parsed.values()]
    authors = await resolve_identities_batch(client, dids)

    replies = [
        Reply(
            uri=r.uri,
            subject_uri=r.value["subject"],
            body=r.value["body"],
            created_at=r.value["createdAt"],
            author=authors[parsed[r.uri].did],
            updated_at=r.value.get("updatedAt"),
            attachments=r.value.get("attachments"),
            quote=r.value.get("quote"),
        )
        for r in records
        if parsed[r.uri].did in authors
    ]
    replies.sort(key=lambda t: t.created_at)
    return replies, backlinks.cursor


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


async def _pds_post(
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


async def create_thread_record(
    client: httpx.AsyncClient,
    session: dict,
    board_uri: str,
    title: str,
    body: str,
    attachments: list[dict] | None = None,
    session_updater=None,
) -> httpx.Response:
    """Create a thread record in the user's repo."""
    record = {
        "$type": lexicon.THREAD,
        "board": board_uri,
        "title": title,
        "body": body,
        "createdAt": now_iso(),
    }
    if attachments:
        record["attachments"] = attachments
    return await _pds_post(
        client,
        session,
        "com.atproto.repo.createRecord",
        {
            "repo": session["did"],
            "collection": lexicon.THREAD,
            "record": record,
        },
        session_updater,
    )


async def create_reply_record(
    client: httpx.AsyncClient,
    session: dict,
    thread_uri: str,
    body: str,
    attachments: list[dict] | None = None,
    quote: str | None = None,
    session_updater=None,
) -> httpx.Response:
    """Create a reply record in the user's repo."""
    record = {
        "$type": lexicon.REPLY,
        "subject": thread_uri,
        "body": body,
        "createdAt": now_iso(),
    }
    if attachments:
        record["attachments"] = attachments
    if quote:
        record["quote"] = quote
    return await _pds_post(
        client,
        session,
        "com.atproto.repo.createRecord",
        {
            "repo": session["did"],
            "collection": lexicon.REPLY,
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
    resp = await _pds_post(
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


async def fetch_inbox(
    client: httpx.AsyncClient,
    did: str,
    pds_url: str,
) -> list[dict]:
    """Fetch inbox: replies to user's threads + quotes of user's replies."""
    from core.constellation import get_backlinks

    all_items = []

    # 1. Replies to user's threads
    try:
        resp = await client.get(
            f"{pds_url}/xrpc/com.atproto.repo.listRecords",
            params={"repo": did, "collection": lexicon.THREAD, "limit": 100},
        )
        resp.raise_for_status()
        thread_records = resp.json().get("records", [])
    except Exception:
        thread_records = []

    for tr in thread_records:
        thread_uri = tr["uri"]
        thread_title = tr["value"].get("title", "")
        board_uri = tr["value"].get("board", "")
        bbs_did = AtUri.parse(board_uri).did if board_uri else did
        try:
            bbs_authors = await resolve_identities_batch(client, [bbs_did])
            bbs_handle = bbs_authors[bbs_did].handle if bbs_did in bbs_authors else ""
        except Exception:
            bbs_handle = ""

        try:
            backlinks = await get_replies(client, thread_uri, limit=50)
            records = await get_records_batch(client, backlinks.records)
            parsed = {r.uri: AtUri.parse(r.uri) for r in records}
            records = [r for r in records if parsed[r.uri].did != did]
            if not records:
                continue

            dids = [parsed[r.uri].did for r in records]
            authors = await resolve_identities_batch(client, dids)

            for r in records:
                author_did = parsed[r.uri].did
                if author_did not in authors:
                    continue
                all_items.append(
                    {
                        "type": "reply",
                        "thread_title": thread_title,
                        "thread_uri": thread_uri,
                        "handle": authors[author_did].handle,
                        "body": r.value.get("body", "")[:200],
                        "created_at": r.value.get("createdAt", ""),
                        "bbs_handle": bbs_handle,
                    }
                )
        except Exception:
            continue

    # 2. Quotes of user's replies
    try:
        resp = await client.get(
            f"{pds_url}/xrpc/com.atproto.repo.listRecords",
            params={"repo": did, "collection": lexicon.REPLY, "limit": 100},
        )
        resp.raise_for_status()
        reply_records = resp.json().get("records", [])
    except Exception:
        reply_records = []

    for rr in reply_records:
        reply_uri = rr["uri"]
        thread_uri = rr["value"].get("subject", "")
        try:
            backlinks = await get_backlinks(
                client,
                subject=reply_uri,
                source=f"{lexicon.REPLY}:quote",
                limit=50,
            )
            if not backlinks.records:
                continue

            records = await get_records_batch(client, backlinks.records)
            parsed = {r.uri: AtUri.parse(r.uri) for r in records}
            records = [r for r in records if parsed[r.uri].did != did]
            if not records:
                continue

            dids = [parsed[r.uri].did for r in records]
            authors = await resolve_identities_batch(client, dids)

            for r in records:
                author_did = parsed[r.uri].did
                if author_did not in authors:
                    continue
                all_items.append(
                    {
                        "type": "quote",
                        "thread_title": "",
                        "thread_uri": thread_uri,
                        "handle": authors[author_did].handle,
                        "body": r.value.get("body", "")[:200],
                        "created_at": r.value.get("createdAt", ""),
                        "bbs_handle": "",
                    }
                )
        except Exception:
            continue

    # Deduplicate and prefer quotes if same record appears in both
    seen = {}
    for item in all_items:
        key = item["handle"] + item["body"] + item["created_at"]
        if key in seen:
            if item["type"] == "quote":
                seen[key] = item
        else:
            seen[key] = item

    deduped = list(seen.values())
    deduped.sort(key=lambda a: a["created_at"], reverse=True)
    return deduped
