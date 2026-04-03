"""Sysop routes — create and edit BBS."""

from quart import Blueprint, current_app, redirect, render_template, request

from core.util import now_iso
from web.helpers import get_user
from web.routes_write import _authed_pds_post, authed_delete_record

bp = Blueprint("sysop", __name__)


async def _has_bbs(user: dict) -> bool:
    """Check if the user has a site record."""
    client = current_app.http_client
    try:
        from core.slingshot import get_record
        await get_record(client, user["did"], "xyz.atboards.site", "self")
        return True
    except Exception:
        return False


@bp.route("/account")
async def account():
    user = await get_user()
    if not user:
        return redirect("/login")

    has_bbs = await _has_bbs(user)
    return await render_template("account.html", user=user, has_bbs=has_bbs)


@bp.route("/account/create", methods=["GET", "POST"])
async def create_bbs():
    user = await get_user()
    if not user:
        return redirect("/login")

    if request.method == "GET":
        return await render_template("sysop_create.html")

    form = await request.form
    name = form.get("name", "").strip()
    description = form.get("description", "").strip()
    intro = form.get("intro", "")
    board_slugs = [s.strip() for s in form.getlist("board_slug") if s.strip()]
    board_names = [s.strip() for s in form.getlist("board_name") if s.strip()]
    board_descs = form.getlist("board_desc")

    if not name or not board_slugs:
        return await render_template("sysop_create.html", error="Name and at least one board are required.")

    now = now_iso()

    # Create board records
    for i, slug in enumerate(board_slugs):
        board_name = board_names[i] if i < len(board_names) else slug
        board_desc = board_descs[i].strip() if i < len(board_descs) else ""
        await _authed_pds_post(user, "com.atproto.repo.putRecord", {
            "repo": user["did"],
            "collection": "xyz.atboards.board",
            "rkey": slug,
            "record": {
                "$type": "xyz.atboards.board",
                "name": board_name,
                "description": board_desc,
                "createdAt": now,
            },
        })

    # Create site record
    await _authed_pds_post(user, "com.atproto.repo.putRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.site",
        "rkey": "self",
        "record": {
            "$type": "xyz.atboards.site",
            "name": name,
            "description": description,
            "intro": intro,
            "boards": board_slugs,
            "bannedDids": [],
            "createdAt": now,
        },
    })

    return redirect(f"/bbs/{user['handle']}")


@bp.route("/account/edit", methods=["GET", "POST"])
async def edit_bbs():
    user = await get_user()
    if not user:
        return redirect("/login")

    client = current_app.http_client

    if request.method == "GET":
        try:
            from core.resolver import resolve_bbs
            bbs = await resolve_bbs(client, user["handle"])
        except Exception:
            return redirect("/account/create")
        return await render_template("sysop_edit.html", bbs=bbs)

    form = await request.form
    name = form.get("name", "").strip()
    description = form.get("description", "").strip()
    intro = form.get("intro", "")
    board_slugs = [s.strip() for s in form.getlist("board_slug") if s.strip()]
    board_names = [s.strip() for s in form.getlist("board_name") if s.strip()]
    board_descs = form.getlist("board_desc")

    if not name:
        return redirect("/account/edit")

    now = now_iso()

    # Fetch existing site record to preserve createdAt
    from core.slingshot import get_record
    try:
        existing = await get_record(client, user["did"], "xyz.atboards.site", "self")
        created_at = existing.value.get("createdAt", now)
        existing_banned = existing.value.get("bannedDids", [])
    except Exception:
        created_at = now
        existing_banned = []

    # Upsert board records
    for i, slug in enumerate(board_slugs):
        board_name = board_names[i] if i < len(board_names) else slug
        board_desc = board_descs[i].strip() if i < len(board_descs) else ""
        await _authed_pds_post(user, "com.atproto.repo.putRecord", {
            "repo": user["did"],
            "collection": "xyz.atboards.board",
            "rkey": slug,
            "record": {
                "$type": "xyz.atboards.board",
                "name": board_name,
                "description": board_desc,
                "createdAt": now,
            },
        })

    # Update site record
    await _authed_pds_post(user, "com.atproto.repo.putRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.site",
        "rkey": "self",
        "record": {
            "$type": "xyz.atboards.site",
            "name": name,
            "description": description,
            "intro": intro,
            "boards": board_slugs,
            "bannedDids": existing_banned,
            "createdAt": created_at,
            "updatedAt": now,
        },
    })

    return redirect(f"/bbs/{user['handle']}")


@bp.route("/bbs/<handle>/news/new", methods=["POST"])
async def create_news(handle: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect(f"/bbs/{handle}")

    form = await request.form
    title = form.get("title", "").strip()
    body = form.get("body", "").strip()
    if not title or not body:
        return redirect(f"/bbs/{handle}")

    site_uri = f"at://{user['did']}/xyz.atboards.site/self"
    now = now_iso()

    await _authed_pds_post(user, "com.atproto.repo.createRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.news",
        "record": {
            "$type": "xyz.atboards.news",
            "site": site_uri,
            "title": title,
            "body": body,
            "createdAt": now,
        },
    })

    return redirect(f"/bbs/{handle}")


@bp.route("/bbs/<handle>/news/<tid>/delete", methods=["POST"])
async def delete_news(handle: str, tid: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect(f"/bbs/{handle}")

    await authed_delete_record(user, "xyz.atboards.news", tid)

    return redirect(f"/bbs/{handle}")
