"""Write routes — creating threads and replies."""

from quart import Blueprint, current_app, redirect, request

from core import lexicon
from core.models import AtUri, AuthError
from core.records import create_reply_record, create_thread_record, delete_record, upload_blob
from web.helpers import get_user, session_updater

bp = Blueprint("write", __name__)


@bp.errorhandler(AuthError)
async def handle_auth_error(e):
    return redirect("/login")


@bp.route("/bbs/<handle>/board/<slug>/new-thread", methods=["POST"])
async def create_thread(handle: str, slug: str):
    user = await get_user()
    if not user:
        return redirect(f"/bbs/{handle}/board/{slug}")

    form = await request.form
    title = form.get("title", "").strip()
    body = form.get("body", "").strip()
    if not title or not body:
        return redirect(f"/bbs/{handle}/board/{slug}")

    from core.resolver import resolve_bbs

    client = current_app.http_client
    from quart import render_template

    try:
        bbs = await resolve_bbs(client, handle)
    except Exception:
        return await render_template(
            "error.html", message="Could not reach this BBS."
        ), 503

    if bbs.site.is_banned(user["did"]):
        return redirect(f"/bbs/{handle}/board/{slug}")

    board_uri = str(AtUri(bbs.identity.did, lexicon.BOARD, slug))

    # Handle file attachments
    attachments = []
    files = (await request.files).getlist("attachments")
    for f in files:
        if f.filename:
            data = f.read()
            try:
                blob_ref = await upload_blob(
                    client,
                    user,
                    data,
                    f.content_type or "application/octet-stream",
                    session_updater,
                )
                attachments.append({"file": blob_ref, "name": f.filename})
            except Exception:
                return await render_template(
                    "error.html",
                    message=f"Failed to upload {f.filename}.",
                ), 400

    resp = await create_thread_record(
        current_app.http_client,
        user,
        board_uri,
        title,
        body,
        attachments=attachments or None,
        session_updater=session_updater,
    )
    resp.raise_for_status()

    return redirect(f"/bbs/{handle}/board/{slug}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/reply", methods=["POST"])
async def create_reply(handle: str, did: str, tid: str):
    user = await get_user()
    if not user:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    form = await request.form
    body = form.get("body", "").strip()
    quote = form.get("quote", "").strip() or None
    if not body:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    thread_uri = str(AtUri(did, lexicon.THREAD, tid))

    # Handle file attachments
    client = current_app.http_client
    attachments = []
    files = (await request.files).getlist("attachments")
    for f in files:
        if f.filename:
            data = f.read()
            try:
                blob_ref = await upload_blob(
                    client,
                    user,
                    data,
                    f.content_type or "application/octet-stream",
                    session_updater,
                )
                attachments.append({"file": blob_ref, "name": f.filename})
            except Exception:
                return await render_template(
                    "error.html",
                    message=f"Failed to upload {f.filename}.",
                ), 400

    resp = await create_reply_record(
        current_app.http_client,
        user,
        thread_uri,
        body,
        attachments=attachments or None,
        quote=quote,
        session_updater=session_updater,
    )
    resp.raise_for_status()

    return redirect(f"/bbs/{handle}/thread/{did}/{tid}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/delete", methods=["POST"])
async def delete_thread(handle: str, did: str, tid: str):
    user = await get_user()
    if not user or user["did"] != did:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    await delete_record(
        current_app.http_client, user, lexicon.THREAD, tid, session_updater
    )
    return redirect(f"/bbs/{handle}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/reply/<reply_tid>/delete", methods=["POST"])
async def delete_reply(handle: str, did: str, tid: str, reply_tid: str):
    user = await get_user()
    if not user:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    await delete_record(
        current_app.http_client, user, lexicon.REPLY, reply_tid, session_updater
    )
    return redirect(f"/bbs/{handle}/thread/{did}/{tid}")
