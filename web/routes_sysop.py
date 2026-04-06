"""Sysop routes — create and edit BBS."""

from quart import Blueprint, current_app, redirect, render_template, request

from core import lexicon
from core.models import AtUri, AuthError
from core.records import (
    create_ban_record,
    create_hidden_record,
    create_news_record,
    delete_record,
    list_pds_records,
    put_board_record,
    put_site_record,
)
from core.util import now_iso
from web.helpers import get_user, session_updater

bp = Blueprint("sysop", __name__)


@bp.errorhandler(AuthError)
async def handle_auth_error(e):
    return redirect("/login")


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

    # Delete ban and hidden records
    for collection in (lexicon.BAN, lexicon.HIDE):
        try:
            records = await list_pds_records(
                client, user["pds_url"], user["did"], collection
            )
            for r in records:
                rkey = r["uri"].split("/")[-1]
                try:
                    await delete_record(client, user, collection, rkey, session_updater)
                except Exception:
                    failed.append(f"{collection}/{rkey}")
        except Exception:
            failed.append(f"{collection} lookup")

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

    client = current_app.http_client

    try:
        # Create board records
        for i, slug in enumerate(board_slugs):
            board_name = board_names[i] if i < len(board_names) else slug
            board_desc = board_descs[i].strip() if i < len(board_descs) else ""
            await put_board_record(
                client, user, slug, board_name, board_desc, now, session_updater
            )

        # Create site record
        await put_site_record(
            client,
            user,
            {
                "$type": lexicon.SITE,
                "name": name,
                "description": description,
                "intro": intro,
                "boards": board_slugs,
                "createdAt": now,
            },
            session_updater,
        )
    except Exception:
        return await error("Could not create BBS.")

    return redirect(f"/bbs/{user['handle']}")


@bp.route("/account/moderate")
async def moderate_bbs():
    user = await get_user()
    if not user:
        return redirect("/login")

    client = current_app.http_client

    try:
        from core.resolver import resolve_bbs

        bbs = await resolve_bbs(client, user["handle"])
    except Exception:
        return redirect("/account/create")

    from core.slingshot import resolve_identities_batch, get_record_by_uri

    # Fetch ban/hide records to get rkeys for delete actions
    ban_records = await list_pds_records(
        client, user["pds_url"], user["did"], lexicon.BAN
    )
    ban_rkeys = {r["value"]["did"]: r["uri"].split("/")[-1] for r in ban_records}

    banned_handles = {}
    if bbs.site.banned_dids:
        try:
            authors = await resolve_identities_batch(client, list(bbs.site.banned_dids))
            banned_handles = {did: authors[did].handle for did in authors}
        except Exception:
            banned_handles = {did: did for did in bbs.site.banned_dids}

    hidden_records = await list_pds_records(
        client, user["pds_url"], user["did"], lexicon.HIDE
    )
    hide_rkeys = {r["value"]["uri"]: r["uri"].split("/")[-1] for r in hidden_records}

    hidden_posts = []
    if bbs.site.hidden_posts:
        try:
            hidden_dids = list({AtUri.parse(uri).did for uri in bbs.site.hidden_posts})
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
        handle=user["handle"],
        banned_handles=banned_handles,
        ban_rkeys=ban_rkeys,
        hidden_posts=hidden_posts,
        hide_rkeys=hide_rkeys,
    )


@bp.route("/bbs/<handle>/unban/<rkey>", methods=["POST"])
async def unban_user(handle: str, rkey: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect("/account/moderate")

    try:
        await delete_record(
            current_app.http_client, user, lexicon.BAN, rkey, session_updater
        )
    except Exception:
        return await error("Could not unban user.")

    return redirect("/account/moderate")


@bp.route("/bbs/<handle>/unhide/<rkey>", methods=["POST"])
async def unhide_post(handle: str, rkey: str):
    user = await get_user()
    if not user or user["handle"] != handle:
        return redirect("/account/moderate")

    try:
        await delete_record(
            current_app.http_client, user, lexicon.HIDE, rkey, session_updater
        )
    except Exception:
        return await error("Could not unhide post.")

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
    except Exception:
        created_at = now

    try:
        # Upsert board records
        for i, slug in enumerate(board_slugs):
            board_name = board_names[i] if i < len(board_names) else slug
            board_desc = board_descs[i].strip() if i < len(board_descs) else ""
            await put_board_record(
                client, user, slug, board_name, board_desc, now, session_updater
            )

        # Update site record
        await put_site_record(
            client,
            user,
            {
                "$type": lexicon.SITE,
                "name": name,
                "description": description,
                "intro": intro,
                "boards": board_slugs,
                "createdAt": created_at,
                "updatedAt": now,
            },
            session_updater,
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

    try:
        await create_news_record(
            current_app.http_client, user, site_uri, title, body, session_updater
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

    try:
        await create_ban_record(
            current_app.http_client, user, did_to_ban, session_updater
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

    try:
        await create_hidden_record(
            current_app.http_client, user, post_uri, session_updater
        )
    except Exception:
        return await error("Could not hide post.")

    return redirect(request.referrer or f"/bbs/{handle}")
