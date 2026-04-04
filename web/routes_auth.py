"""OAuth login/callback/logout routes for the web app."""

import json
from urllib.parse import quote, urlencode, urlparse

from authlib.jose import JsonWebKey
from quart import Blueprint, current_app, redirect, request, session

from core.auth.oauth import (
    exchange_code,
    fetch_authserver_meta,
    resolve_pds_authserver,
    revoke_tokens,
    send_par_request,
)
from core.slingshot import resolve_identity

bp = Blueprint("auth", __name__)

OAUTH_SCOPE = "atproto transition:generic collection:xyz.atboards.site collection:xyz.atboards.board collection:xyz.atboards.news collection:xyz.atboards.thread collection:xyz.atboards.reply"


def _compute_client_id() -> tuple[str, str]:
    """Compute client_id and redirect_uri based on PUBLIC_URL.

    For loopback (localhost/127.0.0.1), uses the AT Protocol loopback
    client ID format. For production, points to the client metadata document.
    """
    public_url = current_app.config["PUBLIC_URL"]
    parsed = urlparse(public_url)

    if parsed.hostname in ("localhost", "127.0.0.1"):
        redirect_uri = f"http://127.0.0.1:{parsed.port}/oauth/callback"
        client_id = "http://localhost?" + urlencode(
            {"redirect_uri": redirect_uri, "scope": OAUTH_SCOPE}
        )
    else:
        app_url = public_url.replace("http://", "https://")
        if not app_url.endswith("/"):
            app_url += "/"
        redirect_uri = f"{app_url}oauth/callback"
        client_id = f"{app_url}oauth-client-metadata.json"

    return client_id, redirect_uri


def _client_secret_jwk():
    return json.loads(current_app.config["CLIENT_SECRET_JWK"])


@bp.route("/oauth-client-metadata.json")
async def client_metadata():
    client_id, redirect_uri = _compute_client_id()
    app_url = current_app.config["PUBLIC_URL"]
    if not app_url.endswith("/"):
        app_url += "/"
    return {
        "client_id": client_id,
        "client_name": "atbbs",
        "client_uri": current_app.config["PUBLIC_URL"],
        "application_type": "web",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "redirect_uris": [redirect_uri],
        "scope": OAUTH_SCOPE,
        "token_endpoint_auth_method": "private_key_jwt",
        "token_endpoint_auth_signing_alg": "ES256",
        "dpop_bound_access_tokens": True,
        "jwks_uri": f"{app_url}oauth/jwks.json",
    }


@bp.route("/oauth/jwks.json")
async def jwks():
    return {
        "keys": [
            json.loads(
                JsonWebKey.import_key(
                    _client_secret_jwk()
                ).as_json(is_private=False)
            )
        ]
    }


@bp.route("/oauth/login", methods=["POST"])
async def login():
    form = await request.form
    handle = form.get("handle", "").strip()
    if not handle:
        return redirect("/")

    client = current_app.http_client
    store = current_app.session_store
    client_id, redirect_uri = _compute_client_id()

    # Resolve identity
    identity = await resolve_identity(client, handle)
    pds_url = identity.pds
    if not pds_url:
        return redirect("/")

    # Discover auth server
    authserver_url = await resolve_pds_authserver(client, pds_url)
    authserver_meta = await fetch_authserver_meta(client, authserver_url)

    # Generate DPoP keypair for this login attempt
    dpop_key = JsonWebKey.generate_key("EC", "P-256", is_private=True)
    dpop_private_jwk_json = dpop_key.as_json(is_private=True)

    # Send PAR
    pkce_verifier, state, dpop_nonce, par_resp = await send_par_request(
        client=client,
        authserver_url=authserver_url,
        authserver_meta=authserver_meta,
        login_hint=handle,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=OAUTH_SCOPE,
        client_secret_jwk=_client_secret_jwk(),
        dpop_private_jwk=dpop_key,
    )

    # Save auth request state
    store.save_auth_request(
        state=state,
        authserver_iss=authserver_url,
        did=identity.did,
        handle=identity.handle,
        pds_url=pds_url,
        pkce_verifier=pkce_verifier,
        scope=OAUTH_SCOPE,
        dpop_authserver_nonce=dpop_nonce,
        dpop_private_jwk=dpop_private_jwk_json,
    )

    # Redirect to auth server
    auth_url = authserver_meta["authorization_endpoint"]
    return redirect(
        f"{auth_url}?client_id={quote(client_id, safe='')}&request_uri={quote(par_resp['request_uri'], safe='')}"
    )


@bp.route("/oauth/callback")
async def callback():
    code = request.args.get("code")
    state = request.args.get("state")
    iss = request.args.get("iss")

    if not code or not state:
        return redirect("/")

    client = current_app.http_client
    store = current_app.session_store
    client_id, redirect_uri = _compute_client_id()

    # Look up auth request
    auth_req = store.get_auth_request(state)
    if not auth_req:
        return redirect("/")

    # Validate issuer
    if iss and iss != auth_req["authserver_iss"]:
        store.delete_auth_request(state)
        return redirect("/")

    # Exchange code for tokens
    token_resp, dpop_nonce = await exchange_code(
        client=client,
        auth_request=auth_req,
        code=code,
        client_id=client_id,
        redirect_uri=redirect_uri,
        client_secret_jwk=_client_secret_jwk(),
    )

    # Save session
    store.save_session(
        did=auth_req["did"],
        handle=auth_req["handle"],
        pds_url=auth_req["pds_url"],
        authserver_iss=auth_req["authserver_iss"],
        access_token=token_resp["access_token"],
        refresh_token=token_resp.get("refresh_token", ""),
        dpop_authserver_nonce=dpop_nonce,
        dpop_pds_nonce="",
        dpop_private_jwk=auth_req["dpop_private_jwk"],
        client_id=client_id,
    )

    # Clean up auth request, set cookie
    store.delete_auth_request(state)
    session["did"] = auth_req["did"]

    return redirect("/")


@bp.route("/oauth/logout", methods=["POST"])
async def logout():
    did = session.get("did")
    if did:
        client = current_app.http_client
        store = current_app.session_store
        client_id, _ = _compute_client_id()
        oauth_session = store.get_session(did)
        if oauth_session:
            try:
                await revoke_tokens(
                    client=client,
                    session=oauth_session,
                    client_id=client_id,
                    client_secret_jwk=_client_secret_jwk(),
                )
            except Exception:
                pass
            store.delete_session(did)
    session.pop("did", None)
    return redirect("/")
