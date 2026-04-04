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
            "hiddenPosts": [],
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

        # Resolve banned DIDs to handles
        from core.slingshot import resolve_identities_batch, get_record_by_uri
        banned_handles = {}
        if bbs.site.banned_dids:
            authors = await resolve_identities_batch(client, list(bbs.site.banned_dids))
            banned_handles = {did: authors[did].handle for did in authors}

        # Hydrate hidden posts
        hidden_posts = []
        if bbs.site.hidden_posts:
            # Resolve all DIDs from hidden post URIs in one batch
            hidden_dids = list({uri.split("/")[2] for uri in bbs.site.hidden_posts if len(uri.split("/")) > 2})
            hidden_authors = await resolve_identities_batch(client, hidden_dids)

            for uri in bbs.site.hidden_posts:
                parts = uri.split("/")
                did = parts[2] if len(parts) > 2 else "?"
                handle = hidden_authors[did].handle if did in hidden_authors else did

                try:
                    record = await get_record_by_uri(client, uri)
                    hidden_posts.append({
                        "uri": uri,
                        "handle": handle,
                        "title": record.value.get("title", ""),
                        "body": record.value.get("body", "")[:100],
                    })
                except Exception:
                    hidden_posts.append({
                        "uri": uri,
                        "handle": handle,
                        "title": "",
                        "body": parts[-1] if parts else uri,
                    })

        return await render_template("sysop_edit.html", bbs=bbs, banned_handles=banned_handles, hidden_posts=hidden_posts)

    form = await request.form
    name = form.get("name", "").strip()
    description = form.get("description", "").strip()
    intro = form.get("intro", "")
    board_slugs = [s.strip() for s in form.getlist("board_slug") if s.strip()]
    board_names = [s.strip() for s in form.getlist("board_name") if s.strip()]
    board_descs = form.getlist("board_desc")
    banned_dids = [d.strip() for d in form.getlist("banned_did") if d.strip()]
    hidden_uris = [u.strip() for u in form.getlist("hidden_uri") if u.strip()]

    if not name:
        return redirect("/account/edit")

    now = now_iso()

    # Fetch existing site record to preserve createdAt
    from core.slingshot import get_record
    try:
        existing = await get_record(client, user["did"], "xyz.atboards.site", "self")
        created_at = existing.value.get("createdAt", now)
    except Exception:
        created_at = now

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
            "bannedDids": banned_dids,
            "hiddenPosts": hidden_uris,
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


@bp.route("/bbs/<handle>/ban/<did_to_ban>", methods=["POST"])
async def ban_user(handle: str, did_to_ban: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect(request.referrer or f"/bbs/{handle}")

    client = current_app.http_client

    # Fetch existing site record
    from core.slingshot import get_record
    try:
        existing = await get_record(client, user["did"], "xyz.atboards.site", "self")
        site_value = existing.value
    except Exception:
        return redirect(request.referrer or f"/bbs/{handle}")

    # Add DID to ban list if not already there
    banned = site_value.get("bannedDids", [])
    if did_to_ban not in banned:
        banned.append(did_to_ban)

    # Update site record
    site_value["bannedDids"] = banned
    site_value["updatedAt"] = now_iso()
    await _authed_pds_post(user, "com.atproto.repo.putRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.site",
        "rkey": "self",
        "record": site_value,
    })

    return redirect(request.referrer or f"/bbs/{handle}")


@bp.route("/bbs/<handle>/hide", methods=["POST"])
async def hide_post(handle: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect(request.referrer or f"/bbs/{handle}")

    form = await request.form
    post_uri = form.get("uri", "").strip()
    if not post_uri:
        return redirect(request.referrer or f"/bbs/{handle}")

    client = current_app.http_client

    from core.slingshot import get_record
    try:
        existing = await get_record(client, user["did"], "xyz.atboards.site", "self")
        site_value = existing.value
    except Exception:
        return redirect(request.referrer or f"/bbs/{handle}")

    hidden = site_value.get("hiddenPosts", [])
    if post_uri not in hidden:
        hidden.append(post_uri)

    site_value["hiddenPosts"] = hidden
    site_value["updatedAt"] = now_iso()
    await _authed_pds_post(user, "com.atproto.repo.putRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.site",
        "rkey": "self",
        "record": site_value,
    })

    return redirect(request.referrer or f"/bbs/{handle}")
