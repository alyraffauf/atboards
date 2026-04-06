import random

import httpx
from quart import Blueprint, current_app, render_template, request

from core import lexicon
from core.models import (
    AtUri,
    BBSNotFoundError,
    NetworkError,
    NoBBSError,
)
from core.records import hydrate_replies, hydrate_threads, thread_from_record
from core.resolver import resolve_bbs
from core.slingshot import get_record, resolve_identities_batch, resolve_identity

bp = Blueprint("main", __name__)


async def error(message: str, status: int = 404):
    return await render_template("error.html", message=message), status


async def check_banned(bbs):
    """Return an error response if the current user is banned, or None."""
    from quart import g

    if g.user and bbs.site.is_banned(g.user.get("did")):
        return await render_template(
            "error.html", message="You have been banned from this BBS."
        ), 403
    return None


@bp.route("/")
async def home():
    return await render_template("home.html")


@bp.route("/login")
async def login_page():
    return await render_template("login.html")


@bp.route("/api/resolve/<handle>")
async def api_resolve(handle: str):
    client = current_app.http_client
    try:
        identity = await resolve_identity(client, handle)
        return {"did": identity.did, "handle": identity.handle}
    except Exception:
        return {"did": None, "handle": None}


@bp.route("/api/discover")
async def discover():
    client = current_app.http_client
    bbses = []
    try:
        resp = await client.get(
            "https://ufos-api.microcosm.blue/records",
            params={"collection": lexicon.SITE, "limit": 50},
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
                    bbses.append(
                        {
                            "handle": authors[did].handle,
                            "name": r["record"].get("name", ""),
                            "description": r["record"].get("description", ""),
                        }
                    )
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

    banned = await check_banned(bbs)
    if banned:
        return banned

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

    banned = await check_banned(bbs)
    if banned:
        return banned

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

    banned = await check_banned(bbs)
    if banned:
        return {"threads": [], "cursor": None, "banned": True}

    current_board = next((b for b in bbs.site.boards if b.slug == slug), None)
    if not current_board:
        return {"threads": [], "cursor": None}

    try:
        threads, next_cursor = await hydrate_threads(
            client, bbs, current_board, cursor=cursor
        )
    except Exception:
        return {"threads": [], "cursor": None}

    return {
        "threads": [
            {
                "uri": t.uri,
                "did": t.author.did,
                "rkey": AtUri.parse(t.uri).rkey,
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

    banned = await check_banned(bbs)
    if banned:
        return banned

    try:
        thread_record = await get_record(client, did, lexicon.THREAD, tid)
        thread_author = await resolve_identity(client, did)
    except httpx.HTTPStatusError:
        return await error("Thread not found.")
    except httpx.TransportError:
        return await error("Could not reach the network. Try again.", 502)

    thread_obj = thread_from_record(thread_record, thread_author)

    board_slug = AtUri.parse(thread_obj.board_uri).rkey
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
    page = int(request.args.get("page", 1))
    handle = request.args.get("handle", "")
    focus_reply = request.args.get("reply", None)

    try:
        if handle:
            bbs = await resolve_bbs(client, handle)
        else:
            bbs = None
    except Exception:
        bbs = None

    if bbs:
        banned = await check_banned(bbs)
        if banned:
            return {"replies": [], "page": 1, "total_pages": 1, "total_replies": 0}

    if not bbs:
        return {"replies": [], "page": 1, "total_pages": 1, "total_replies": 0}

    thread_uri = str(AtUri(did, lexicon.THREAD, tid))

    try:
        result = await hydrate_replies(
            client, bbs, thread_uri, page=page, focus_reply=focus_reply
        )
    except Exception:
        return {"replies": [], "page": 1, "total_pages": 1, "total_replies": 0}

    return {
        "replies": [
            {
                "uri": r.uri,
                "did": r.author.did,
                "rkey": AtUri.parse(r.uri).rkey,
                "handle": r.author.handle,
                "pds_url": r.author.pds or "",
                "body": r.body,
                "created_at": r.created_at,
                "attachments": r.attachments or [],
                "quote": r.quote,
            }
            for r in result.replies
        ],
        "page": result.page,
        "total_pages": result.total_pages,
        "total_replies": result.total_replies,
    }
