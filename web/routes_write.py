"""Write routes — creating threads and replies."""

from quart import Blueprint, current_app, redirect, request

from core.records import upload_blob
from core.util import now_iso
from web.helpers import get_user, session_updater

bp = Blueprint("write", __name__)


async def _authed_pds_post(user: dict, endpoint: str, body: dict):
    """Make an authenticated POST to the user's PDS."""
    from core.records import _pds_post

    return await _pds_post(
        current_app.http_client, user, endpoint, body, session_updater
    )


async def authed_delete_record(user: dict, collection: str, rkey: str):
    """Delete a record from the user's repo."""
    resp = await _authed_pds_post(
        user,
        "com.atproto.repo.deleteRecord",
        {
            "repo": user["did"],
            "collection": collection,
            "rkey": rkey,
        },
    )
    resp.raise_for_status()
    return resp


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
    try:
        bbs = await resolve_bbs(client, handle)
    except Exception:
        return redirect(f"/bbs/{handle}/board/{slug}")

    if bbs.site.is_banned(user["did"]):
        return redirect(f"/bbs/{handle}/board/{slug}")

    board_uri = f"at://{bbs.identity.did}/xyz.atboards.board/{slug}"

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
                    message=f"Failed to upload {f.filename}. The file may be too large.",
                ), 400

    record = {
        "$type": "xyz.atboards.thread",
        "board": board_uri,
        "title": title,
        "body": body,
        "createdAt": now_iso(),
    }
    if attachments:
        record["attachments"] = attachments

    resp = await _authed_pds_post(
        user,
        "com.atproto.repo.createRecord",
        {
            "repo": user["did"],
            "collection": "xyz.atboards.thread",
            "record": record,
        },
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

    thread_uri = f"at://{did}/xyz.atboards.thread/{tid}"

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
                    message=f"Failed to upload {f.filename}. The file may be too large.",
                ), 400

    record = {
        "$type": "xyz.atboards.reply",
        "subject": thread_uri,
        "body": body,
        "createdAt": now_iso(),
    }
    if attachments:
        record["attachments"] = attachments
    if quote:
        record["quote"] = quote

    resp = await _authed_pds_post(
        user,
        "com.atproto.repo.createRecord",
        {
            "repo": user["did"],
            "collection": "xyz.atboards.reply",
            "record": record,
        },
    )
    resp.raise_for_status()

    return redirect(f"/bbs/{handle}/thread/{did}/{tid}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/delete", methods=["POST"])
async def delete_thread(handle: str, did: str, tid: str):
    user = await get_user()
    if not user or user["did"] != did:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    await authed_delete_record(user, "xyz.atboards.thread", tid)
    return redirect(f"/bbs/{handle}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/reply/<reply_tid>/delete", methods=["POST"])
async def delete_reply(handle: str, did: str, tid: str, reply_tid: str):
    user = await get_user()
    if not user:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    await authed_delete_record(user, "xyz.atboards.reply", reply_tid)
    return redirect(f"/bbs/{handle}/thread/{did}/{tid}")
