"""Sysop routes — create and edit BBS."""

from quart import Blueprint, current_app, redirect, render_template, request

from core import lexicon
from core.models import AtUri, AuthError
from core.records import _pds_post, delete_record
from core.util import now_iso
from web.helpers import get_user, session_updater

bp = Blueprint("sysop", __name__)


@bp.errorhandler(AuthError)
async def handle_auth_error(e):
    return redirect("/login")


async def _authed_pds_post(user: dict, endpoint: str, body: dict):
    """Make an authenticated POST to the user's PDS."""
    return await _pds_post(
        current_app.http_client, user, endpoint, body, session_updater
    )


async def _has_bbs(user: dict) -> bool:
    """Check if the user has a site record."""
    client = current_app.http_client
    try:
        from core.slingshot import get_record

        await get_record(client, user["did"], lexicon.SITE, "self")
        return True
    except Exception:
        return False


async def error(message: str, status: int = 500):
    return await render_template("error.html", message=message), status


@bp.route("/account")
async def account():
    user = await get_user()
    if not user:
        return redirect("/login")

    bbs_name = None
    has_bbs = await _has_bbs(user)
    if has_bbs:
        try:
            from core.slingshot import get_record

            record = await get_record(
                current_app.http_client, user["did"], lexicon.SITE, "self"
            )
            bbs_name = record.value.get("name", user["handle"])
        except Exception:
            bbs_name = user["handle"]
    return await render_template(
        "account.html", user=user, has_bbs=has_bbs, bbs_name=bbs_name
    )


@bp.route("/account/delete", methods=["POST"])
async def delete_bbs():
    user = await get_user()
    if not user:
        return redirect("/login")

    client = current_app.http_client

    # Fetch site record to get board slugs and news
    from core.slingshot import get_record

    try:
        existing = await get_record(client, user["did"], lexicon.SITE, "self")
        board_slugs = existing.value.get("boards", [])
    except Exception:
        return redirect("/account")

    # Delete board records
    failed = []
    for slug in board_slugs:
        try:
            await delete_record(
                    current_app.http_client, user, lexicon.BOARD, slug, session_updater
                )
        except Exception:
            failed.append(f"board/{slug}")

    # Delete news records (via Constellation backlinks)
    from core.constellation import get_news

    site_uri = str(AtUri(user["did"], lexicon.SITE, "self"))
    try:
        backlinks = await get_news(client, site_uri)
        for ref in backlinks.records:
            if ref.did == user["did"]:
                try:
                    await delete_record(
                        current_app.http_client,
                        user,
                        lexicon.NEWS,
                        ref.rkey,
                        session_updater,
                    )
                except Exception:
                    failed.append(f"news/{ref.rkey}")
    except Exception:
        failed.append("news lookup")

    if failed:
        return await error(
            f"Could not delete: {', '.join(failed)}. Site record was not deleted."
        )

    # Delete site record
    try:
        await delete_record(
            current_app.http_client, user, lexicon.SITE, "self", session_updater
        )
    except Exception:
        return await error("Could not delete BBS.")

    return redirect("/account")


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
        return await render_template(
            "sysop_create.html", error="Name and at least one board are required."
        )

    now = now_iso()

    try:
        # Create board records
        for i, slug in enumerate(board_slugs):
            board_name = board_names[i] if i < len(board_names) else slug
            board_desc = board_descs[i].strip() if i < len(board_descs) else ""
            await _authed_pds_post(
                user,
                "com.atproto.repo.putRecord",
                {
                    "repo": user["did"],
                    "collection": lexicon.BOARD,
                    "rkey": slug,
                    "record": {
                        "$type": lexicon.BOARD,
                        "name": board_name,
                        "description": board_desc,
                        "createdAt": now,
                    },
                },
            )

        # Create site record
        await _authed_pds_post(
            user,
            "com.atproto.repo.putRecord",
            {
                "repo": user["did"],
                "collection": lexicon.SITE,
                "rkey": "self",
                "record": {
                    "$type": lexicon.SITE,
                    "name": name,
                    "description": description,
                    "intro": intro,
                    "boards": board_slugs,
                    "bannedDids": [],
                    "hiddenPosts": [],
                    "createdAt": now,
                },
            },
        )
    except Exception:
        return await error("Could not create BBS.")

    return redirect(f"/bbs/{user['handle']}")


@bp.route("/account/moderate", methods=["GET", "POST"])
async def moderate_bbs():
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

        from core.slingshot import resolve_identities_batch, get_record_by_uri

        banned_handles = {}
        if bbs.site.banned_dids:
            try:
                authors = await resolve_identities_batch(
                    client, list(bbs.site.banned_dids)
                )
                banned_handles = {did: authors[did].handle for did in authors}
            except Exception:
                banned_handles = {did: did for did in bbs.site.banned_dids}

        hidden_posts = []
        if bbs.site.hidden_posts:
            try:
                hidden_dids = list(
                    {AtUri.parse(uri).did for uri in bbs.site.hidden_posts}
                )
                hidden_authors = await resolve_identities_batch(client, hidden_dids)
            except Exception:
                hidden_authors = {}

            for uri in bbs.site.hidden_posts:
                did = AtUri.parse(uri).did
                handle = hidden_authors[did].handle if did in hidden_authors else did

                try:
                    record = await get_record_by_uri(client, uri)
                    hidden_posts.append(
                        {
                            "uri": uri,
                            "handle": handle,
                            "title": record.value.get("title", ""),
                            "body": record.value.get("body", "")[:100],
                        }
                    )
                except Exception:
                    hidden_posts.append(
                        {
                            "uri": uri,
                            "handle": handle,
                            "title": "",
                            "body": uri,
                        }
                    )

        return await render_template(
            "sysop_moderate.html",
            bbs=bbs,
            banned_handles=banned_handles,
            hidden_posts=hidden_posts,
        )

    # POST — save moderation changes
    form = await request.form
    banned_dids = [d.strip() for d in form.getlist("banned_did") if d.strip()]
    hidden_uris = [u.strip() for u in form.getlist("hidden_uri") if u.strip()]

    from core.slingshot import get_record

    try:
        existing = await get_record(client, user["did"], lexicon.SITE, "self")
        site_value = existing.value
    except Exception:
        return redirect("/account/moderate")

    site_value["bannedDids"] = banned_dids
    site_value["hiddenPosts"] = hidden_uris
    site_value["updatedAt"] = now_iso()

    try:
        await _authed_pds_post(
            user,
            "com.atproto.repo.putRecord",
            {
                "repo": user["did"],
                "collection": lexicon.SITE,
                "rkey": "self",
                "record": site_value,
            },
        )
    except Exception:
        return await error("Could not save moderation changes.")

    return redirect("/account/moderate")


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
        existing = await get_record(client, user["did"], lexicon.SITE, "self")
        created_at = existing.value.get("createdAt", now)
        existing_banned = existing.value.get("bannedDids", [])
        existing_hidden = existing.value.get("hiddenPosts", [])
    except Exception:
        created_at = now
        existing_banned = []
        existing_hidden = []

    try:
        # Upsert board records
        for i, slug in enumerate(board_slugs):
            board_name = board_names[i] if i < len(board_names) else slug
            board_desc = board_descs[i].strip() if i < len(board_descs) else ""
            await _authed_pds_post(
                user,
                "com.atproto.repo.putRecord",
                {
                    "repo": user["did"],
                    "collection": lexicon.BOARD,
                    "rkey": slug,
                    "record": {
                        "$type": lexicon.BOARD,
                        "name": board_name,
                        "description": board_desc,
                        "createdAt": now,
                    },
                },
            )

        # Update site record
        await _authed_pds_post(
            user,
            "com.atproto.repo.putRecord",
            {
                "repo": user["did"],
                "collection": lexicon.SITE,
                "rkey": "self",
                "record": {
                    "$type": lexicon.SITE,
                    "name": name,
                    "description": description,
                    "intro": intro,
                    "boards": board_slugs,
                    "bannedDids": existing_banned,
                    "hiddenPosts": existing_hidden,
                    "createdAt": created_at,
                    "updatedAt": now,
                },
            },
        )
    except Exception:
        return await error("Could not update BBS.")

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

    site_uri = str(AtUri(user["did"], lexicon.SITE, "self"))
    now = now_iso()

    try:
        await _authed_pds_post(
            user,
            "com.atproto.repo.createRecord",
            {
                "repo": user["did"],
                "collection": lexicon.NEWS,
                "record": {
                    "$type": lexicon.NEWS,
                    "site": site_uri,
                    "title": title,
                    "body": body,
                    "createdAt": now,
                },
            },
        )
    except Exception:
        return await error("Could not post news.")

    return redirect(f"/bbs/{handle}")


@bp.route("/bbs/<handle>/news/<tid>/delete", methods=["POST"])
async def delete_news(handle: str, tid: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect(f"/bbs/{handle}")

    try:
        await delete_record(
            current_app.http_client, user, lexicon.NEWS, tid, session_updater
        )
    except Exception:
        return await error("Could not delete news.")

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
        existing = await get_record(client, user["did"], lexicon.SITE, "self")
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
    try:
        await _authed_pds_post(
            user,
            "com.atproto.repo.putRecord",
            {
                "repo": user["did"],
                "collection": lexicon.SITE,
                "rkey": "self",
                "record": site_value,
            },
        )
    except Exception:
        return await error("Could not ban user.")

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
        existing = await get_record(client, user["did"], lexicon.SITE, "self")
        site_value = existing.value
    except Exception:
        return redirect(request.referrer or f"/bbs/{handle}")

    hidden = site_value.get("hiddenPosts", [])
    if post_uri not in hidden:
        hidden.append(post_uri)

    site_value["hiddenPosts"] = hidden
    site_value["updatedAt"] = now_iso()
    try:
        await _authed_pds_post(
            user,
            "com.atproto.repo.putRecord",
            {
                "repo": user["did"],
                "collection": lexicon.SITE,
                "rkey": "self",
                "record": site_value,
            },
        )
    except Exception:
        return await error("Could not hide post.")

    return redirect(request.referrer or f"/bbs/{handle}")
