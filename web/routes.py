import random

import httpx
from quart import Blueprint, current_app, render_template, request

from core.models import (
    BBSNotFoundError, NetworkError, NoBBSError, Thread,
)
from core.records import hydrate_replies, hydrate_threads
from core.resolver import resolve_bbs
from core.slingshot import get_record, resolve_identity, resolve_identities_batch

bp = Blueprint("main", __name__)


async def error(message: str, status: int = 404):
    return await render_template("error.html", message=message), status


@bp.route("/")
async def home():
    return await render_template("home.html")


@bp.route("/login")
async def login_page():
    return await render_template("login.html")


@bp.route("/api/discover")
async def discover():
    client = current_app.http_client
    bbses = []
    try:
        resp = await client.get(
            "https://ufos-api.microcosm.blue/records",
            params={"collection": "xyz.atboards.site", "limit": 50},
        )
        if resp.status_code == 200:
            raw = resp.json()
            if len(raw) > 5:
                raw = random.sample(raw, 5)
            dids = [r["did"] for r in raw]
            authors = await resolve_identities_batch(client, dids)
            for r in raw:
                did = r["did"]
                if did in authors:
                    bbses.append({
                        "handle": authors[did].handle,
                        "name": r["record"].get("name", ""),
                        "description": r["record"].get("description", ""),
                    })
    except Exception:
        pass
    return {"bbses": bbses}


@bp.route("/bbs/<handle>")
async def site(handle: str):
    client = current_app.http_client
    try:
        bbs = await resolve_bbs(client, handle)
    except BBSNotFoundError:
        return await error("BBS not found.")
    except NoBBSError:
        return await error("This account isn't running a BBS.")
    except NetworkError:
        return await error("Could not reach the network. Try again.", 502)

    return await render_template("site.html", bbs=bbs, handle=handle)


@bp.route("/bbs/<handle>/board/<slug>")
async def board(handle: str, slug: str):
    client = current_app.http_client
    try:
        bbs = await resolve_bbs(client, handle)
    except BBSNotFoundError:
        return await error("BBS not found.")
    except NoBBSError:
        return await error("This account isn't running a BBS.")
    except NetworkError:
        return await error("Could not reach the network. Try again.", 502)

    current_board = next((b for b in bbs.site.boards if b.slug == slug), None)
    if current_board is None:
        return await error("Board not found.")

    return await render_template(
        "board.html",
        bbs=bbs,
        board=current_board,
        handle=handle,
    )


@bp.route("/api/threads/<handle>/<slug>")
async def api_threads(handle: str, slug: str):
    client = current_app.http_client
    cursor = request.args.get("cursor")

    try:
        bbs = await resolve_bbs(client, handle)
    except Exception:
        return {"threads": [], "cursor": None}

    current_board = next((b for b in bbs.site.boards if b.slug == slug), None)
    if not current_board:
        return {"threads": [], "cursor": None}

    try:
        threads, next_cursor = await hydrate_threads(client, bbs, current_board, cursor=cursor)
    except Exception:
        return {"threads": [], "cursor": None}

    return {
        "threads": [
            {
                "uri": t.uri,
                "did": t.author.did,
                "rkey": t.uri.split("/")[-1],
                "handle": t.author.handle,
                "title": t.title,
                "body": t.body,
                "created_at": t.created_at,
            }
            for t in threads
        ],
        "cursor": next_cursor,
    }


@bp.route("/bbs/<handle>/thread/<did>/<tid>")
async def thread(handle: str, did: str, tid: str):
    client = current_app.http_client
    try:
        bbs = await resolve_bbs(client, handle)
    except BBSNotFoundError:
        return await error("BBS not found.")
    except NoBBSError:
        return await error("This account isn't running a BBS.")
    except NetworkError:
        return await error("Could not reach the network. Try again.", 502)

    try:
        thread_record = await get_record(client, did, "xyz.atboards.thread", tid)
        thread_author = await resolve_identity(client, did)
    except httpx.HTTPStatusError:
        return await error("Thread not found.")
    except httpx.TransportError:
        return await error("Could not reach the network. Try again.", 502)

    thread_obj = Thread(
        uri=thread_record.uri,
        board_uri=thread_record.value["board"],
        title=thread_record.value["title"],
        body=thread_record.value["body"],
        created_at=thread_record.value["createdAt"],
        author=thread_author,
        updated_at=thread_record.value.get("updatedAt"),
    )

    board_slug = thread_obj.board_uri.split("/")[-1]
    current_board = next((b for b in bbs.site.boards if b.slug == board_slug), None)

    return await render_template(
        "thread.html",
        bbs=bbs,
        thread=thread_obj,
        board=current_board,
        handle=handle,
    )


@bp.route("/api/replies/<did>/<tid>")
async def api_replies(did: str, tid: str):
    client = current_app.http_client
    cursor = request.args.get("cursor")
    handle = request.args.get("handle", "")

    try:
        if handle:
            bbs = await resolve_bbs(client, handle)
        else:
            bbs = None
    except Exception:
        bbs = None

    if not bbs:
        return {"replies": [], "cursor": None}

    # Build a minimal Thread object for hydrate_replies
    thread_uri = f"at://{did}/xyz.atboards.thread/{tid}"
    from core.models import MiniDoc
    dummy_thread = Thread(
        uri=thread_uri,
        board_uri="",
        title="",
        body="",
        created_at="",
        author=MiniDoc(did=did, handle=""),
    )

    try:
        replies, next_cursor = await hydrate_replies(client, bbs, dummy_thread, cursor=cursor)
    except Exception:
        return {"replies": [], "cursor": None}

    return {
        "replies": [
            {
                "uri": r.uri,
                "did": r.author.did,
                "rkey": r.uri.split("/")[-1],
                "handle": r.author.handle,
                "body": r.body,
                "created_at": r.created_at,
            }
            for r in replies
        ],
        "cursor": next_cursor,
    }
