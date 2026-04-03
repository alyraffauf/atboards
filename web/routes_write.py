"""Write routes — creating threads and replies."""

from quart import Blueprint, current_app, redirect, request

from core.auth.oauth import pds_request, refresh_tokens
from core.auth.session import SessionStore
from core.util import now_iso
from web.helpers import get_user, session_updater

bp = Blueprint("write", __name__)


async def _authed_pds_post(user: dict, endpoint: str, body: dict):
    """Make an authenticated POST to the user's PDS, with token refresh on 401."""
    client = current_app.http_client
    url = f"{user['pds_url']}/xrpc/{endpoint}"

    resp = await pds_request(client, "POST", url, user, session_updater, body=body)

    # Token refresh on 401
    if resp.status_code == 401:
        from web.routes_auth import _compute_client_id, _client_secret_jwk
        client_id, _ = _compute_client_id()
        client_secret_jwk = _client_secret_jwk()

        token_resp, dpop_nonce = await refresh_tokens(
            client=client,
            session=user,
            client_id=client_id,
            client_secret_jwk=client_secret_jwk,
        )

        store: SessionStore = current_app.session_store
        store.update_session_tokens(
            user["did"],
            token_resp["access_token"],
            token_resp.get("refresh_token", user["refresh_token"]),
            dpop_nonce,
        )

        user["access_token"] = token_resp["access_token"]
        if "refresh_token" in token_resp:
            user["refresh_token"] = token_resp["refresh_token"]
        user["dpop_authserver_nonce"] = dpop_nonce

        resp = await pds_request(client, "POST", url, user, session_updater, body=body)

    return resp


async def authed_delete_record(user: dict, collection: str, rkey: str):
    """Delete a record from the user's repo via OAuth."""
    resp = await _authed_pds_post(user, "com.atproto.repo.deleteRecord", {
        "repo": user["did"],
        "collection": collection,
        "rkey": rkey,
    })
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
    board_uri = f"at://{bbs.identity.did}/xyz.atboards.board/{slug}"

    resp = await _authed_pds_post(user, "com.atproto.repo.createRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.thread",
        "record": {
            "$type": "xyz.atboards.thread",
            "board": board_uri,
            "title": title,
            "body": body,
            "createdAt": now_iso(),
        },
    })
    resp.raise_for_status()

    return redirect(f"/bbs/{handle}/board/{slug}")


@bp.route("/bbs/<handle>/thread/<did>/<tid>/reply", methods=["POST"])
async def create_reply(handle: str, did: str, tid: str):
    user = await get_user()
    if not user:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    form = await request.form
    body = form.get("body", "").strip()
    if not body:
        return redirect(f"/bbs/{handle}/thread/{did}/{tid}")

    thread_uri = f"at://{did}/xyz.atboards.thread/{tid}"

    resp = await _authed_pds_post(user, "com.atproto.repo.createRecord", {
        "repo": user["did"],
        "collection": "xyz.atboards.reply",
        "record": {
            "$type": "xyz.atboards.reply",
            "subject": thread_uri,
            "body": body,
            "createdAt": now_iso(),
        },
    })
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
