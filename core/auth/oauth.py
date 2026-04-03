"""AT Protocol OAuth helpers.

Async, framework-agnostic. Handles DPoP proof generation, PAR requests,
token exchange, and authenticated PDS requests.

Adapted from morsels (github.com/alyraffauf/morsels).
"""

import json
import time
import urllib.request

import httpx
from authlib.common.security import generate_token
from authlib.jose import JsonWebKey, jwt
from authlib.oauth2.rfc7636 import create_s256_code_challenge


def is_safe_url(url: str) -> bool:
    """SSRF check — only allows HTTPS URLs with public hostnames."""
    from urllib.parse import urlparse

    parts = urlparse(url)
    if not (
        parts.scheme == "https"
        and parts.hostname is not None
        and parts.hostname == parts.netloc
        and parts.username is None
        and parts.password is None
        and parts.port is None
    ):
        return False
    segments = parts.hostname.split(".")
    if not (
        len(segments) >= 2
        and segments[-1] not in ["local", "arpa", "internal", "localhost"]
    ):
        return False
    if segments[-1].isdigit():
        return False
    return True


def is_valid_authserver_meta(obj: dict, url: str) -> bool:
    """Validate authorization server metadata against atproto requirements."""
    from urllib.parse import urlparse

    fetch_url = urlparse(url)
    issuer_url = urlparse(obj["issuer"])
    assert issuer_url.hostname == fetch_url.hostname
    assert issuer_url.scheme == "https"
    assert "code" in obj["response_types_supported"]
    assert "authorization_code" in obj["grant_types_supported"]
    assert "refresh_token" in obj["grant_types_supported"]
    assert "S256" in obj["code_challenge_methods_supported"]
    assert "private_key_jwt" in obj["token_endpoint_auth_methods_supported"]
    assert "ES256" in obj["token_endpoint_auth_signing_alg_values_supported"]
    assert "atproto" in obj["scopes_supported"]
    assert obj["authorization_response_iss_parameter_supported"] is True
    assert obj["pushed_authorization_request_endpoint"] is not None
    assert obj["require_pushed_authorization_requests"] is True
    assert "ES256" in obj["dpop_signing_alg_values_supported"]
    assert obj["client_id_metadata_document_supported"] is True
    return True


async def resolve_pds_authserver(client: httpx.AsyncClient, pds_url: str) -> str:
    """Given a PDS URL, find its authorization server."""
    assert is_safe_url(pds_url)
    resp = await client.get(f"{pds_url}/.well-known/oauth-protected-resource")
    resp.raise_for_status()
    return resp.json()["authorization_servers"][0]


async def fetch_authserver_meta(client: httpx.AsyncClient, url: str) -> dict:
    """Fetch and validate authorization server metadata."""
    assert is_safe_url(url)
    resp = await client.get(f"{url}/.well-known/oauth-authorization-server")
    resp.raise_for_status()
    meta = resp.json()
    assert is_valid_authserver_meta(meta, url)
    return meta


def client_assertion_jwt(client_id: str, authserver_url: str, client_secret_jwk) -> str:
    """Create a signed JWT asserting our client identity."""
    return jwt.encode(
        {"alg": "ES256", "kid": client_secret_jwk["kid"]},
        {
            "iss": client_id,
            "sub": client_id,
            "aud": authserver_url,
            "jti": generate_token(),
            "iat": int(time.time()),
            "exp": int(time.time()) + 60,
        },
        client_secret_jwk,
    ).decode("utf-8")


def authserver_dpop_jwt(method: str, url: str, nonce: str, dpop_private_jwk) -> str:
    """Create a DPoP proof JWT for auth server requests."""
    dpop_pub_jwk = json.loads(dpop_private_jwk.as_json(is_private=False))
    body = {
        "jti": generate_token(),
        "htm": method,
        "htu": url,
        "iat": int(time.time()),
        "exp": int(time.time()) + 30,
    }
    if nonce:
        body["nonce"] = nonce
    return jwt.encode(
        {"typ": "dpop+jwt", "alg": "ES256", "jwk": dpop_pub_jwk},
        body,
        dpop_private_jwk,
    ).decode("utf-8")


def pds_dpop_jwt(method: str, url: str, nonce: str, access_token: str, dpop_private_jwk) -> str:
    """Create a DPoP proof JWT for PDS requests (includes ath claim)."""
    dpop_pub_jwk = json.loads(dpop_private_jwk.as_json(is_private=False))
    body = {
        "jti": generate_token(),
        "htm": method,
        "htu": url,
        "iat": int(time.time()),
        "exp": int(time.time()) + 10,
        "ath": create_s256_code_challenge(access_token),
    }
    if nonce:
        body["nonce"] = nonce
    return jwt.encode(
        {"typ": "dpop+jwt", "alg": "ES256", "jwk": dpop_pub_jwk},
        body,
        dpop_private_jwk,
    ).decode("utf-8")


def _parse_www_authenticate(data: str):
    scheme, _, params = data.partition(" ")
    items = urllib.request.parse_http_list(params)
    opts = urllib.request.parse_keqv_list(items)
    return scheme, opts


def is_use_dpop_nonce_error(resp: httpx.Response) -> bool:
    """Check if a response is asking us to retry with a new DPoP nonce."""
    if resp.status_code not in [400, 401]:
        return False
    www_authenticate = resp.headers.get("WWW-Authenticate")
    if www_authenticate:
        try:
            scheme, params = _parse_www_authenticate(www_authenticate)
            if scheme.lower() == "dpop" and params.get("error") == "use_dpop_nonce":
                return True
        except Exception:
            pass
    try:
        json_body = resp.json()
        if isinstance(json_body, dict) and json_body.get("error") == "use_dpop_nonce":
            return True
    except Exception:
        pass
    return False


async def auth_server_post(
    client: httpx.AsyncClient,
    authserver_url: str,
    client_id: str,
    client_secret_jwk,
    dpop_private_jwk,
    dpop_nonce: str,
    post_url: str,
    post_data: dict,
) -> tuple[str, httpx.Response]:
    """POST to auth server with client assertion and DPoP, handling nonce rotation."""
    assertion = client_assertion_jwt(client_id, authserver_url, client_secret_jwk)
    post_data = {
        **post_data,
        "client_id": client_id,
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": assertion,
    }

    assert is_safe_url(post_url)
    dpop_proof = authserver_dpop_jwt("POST", post_url, dpop_nonce, dpop_private_jwk)
    resp = await client.post(post_url, data=post_data, headers={"DPoP": dpop_proof})

    if is_use_dpop_nonce_error(resp):
        dpop_nonce = resp.headers["DPoP-Nonce"]
        dpop_proof = authserver_dpop_jwt("POST", post_url, dpop_nonce, dpop_private_jwk)
        resp = await client.post(post_url, data=post_data, headers={"DPoP": dpop_proof})

    return dpop_nonce, resp


async def send_par_request(
    client: httpx.AsyncClient,
    authserver_url: str,
    authserver_meta: dict,
    login_hint: str,
    client_id: str,
    redirect_uri: str,
    scope: str,
    client_secret_jwk,
    dpop_private_jwk,
) -> tuple[str, str, str, dict]:
    """Send a Pushed Authorization Request.

    Returns (pkce_verifier, state, dpop_nonce, response_json).
    """
    par_url = authserver_meta["pushed_authorization_request_endpoint"]
    state = generate_token()
    pkce_verifier = generate_token(48)
    code_challenge = create_s256_code_challenge(pkce_verifier)

    par_body = {
        "response_type": "code",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "redirect_uri": redirect_uri,
        "scope": scope,
    }
    if login_hint:
        par_body["login_hint"] = login_hint

    dpop_nonce, resp = await auth_server_post(
        client=client,
        authserver_url=authserver_url,
        client_id=client_id,
        client_secret_jwk=client_secret_jwk,
        dpop_private_jwk=dpop_private_jwk,
        dpop_nonce="",
        post_url=par_url,
        post_data=par_body,
    )
    resp.raise_for_status()
    return pkce_verifier, state, dpop_nonce, resp.json()


async def exchange_code(
    client: httpx.AsyncClient,
    auth_request: dict,
    code: str,
    client_id: str,
    redirect_uri: str,
    client_secret_jwk,
) -> tuple[dict, str]:
    """Exchange authorization code for tokens. Returns (token_body, dpop_nonce)."""
    authserver_url = auth_request["authserver_iss"]
    authserver_meta = await fetch_authserver_meta(client, authserver_url)
    token_url = authserver_meta["token_endpoint"]
    dpop_private_jwk = JsonWebKey.import_key(json.loads(auth_request["dpop_private_jwk"]))

    dpop_nonce, resp = await auth_server_post(
        client=client,
        authserver_url=authserver_url,
        client_id=client_id,
        client_secret_jwk=client_secret_jwk,
        dpop_private_jwk=dpop_private_jwk,
        dpop_nonce=auth_request["dpop_authserver_nonce"],
        post_url=token_url,
        post_data={
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": auth_request["pkce_verifier"],
        },
    )
    resp.raise_for_status()
    return resp.json(), dpop_nonce


async def refresh_tokens(
    client: httpx.AsyncClient,
    session: dict,
    client_id: str,
    client_secret_jwk,
) -> tuple[dict, str]:
    """Refresh an access token. Returns (token_body, dpop_nonce)."""
    authserver_url = session["authserver_iss"]
    authserver_meta = await fetch_authserver_meta(client, authserver_url)
    token_url = authserver_meta["token_endpoint"]
    dpop_private_jwk = JsonWebKey.import_key(json.loads(session["dpop_private_jwk"]))

    dpop_nonce, resp = await auth_server_post(
        client=client,
        authserver_url=authserver_url,
        client_id=client_id,
        client_secret_jwk=client_secret_jwk,
        dpop_private_jwk=dpop_private_jwk,
        dpop_nonce=session["dpop_authserver_nonce"],
        post_url=token_url,
        post_data={
            "grant_type": "refresh_token",
            "refresh_token": session["refresh_token"],
        },
    )
    resp.raise_for_status()
    return resp.json(), dpop_nonce


async def revoke_tokens(
    client: httpx.AsyncClient,
    session: dict,
    client_id: str,
    client_secret_jwk,
) -> None:
    """Revoke access and refresh tokens."""
    authserver_url = session["authserver_iss"]
    authserver_meta = await fetch_authserver_meta(client, authserver_url)
    revoke_url = authserver_meta.get("revocation_endpoint")
    if not revoke_url:
        return

    dpop_private_jwk = JsonWebKey.import_key(json.loads(session["dpop_private_jwk"]))
    dpop_nonce = session["dpop_authserver_nonce"]

    for token_type in ["access_token", "refresh_token"]:
        dpop_nonce, resp = await auth_server_post(
            client=client,
            authserver_url=authserver_url,
            client_id=client_id,
            client_secret_jwk=client_secret_jwk,
            dpop_private_jwk=dpop_private_jwk,
            dpop_nonce=dpop_nonce,
            post_url=revoke_url,
            post_data={
                "token": session[token_type],
                "token_type_hint": token_type,
            },
        )


async def pds_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    session: dict,
    session_updater,
    body: dict | None = None,
) -> httpx.Response:
    """Make an authenticated request to a user's PDS with DPoP.

    session_updater is a callable(did, field, value) to persist nonce updates.
    """
    dpop_private_jwk = JsonWebKey.import_key(json.loads(session["dpop_private_jwk"]))
    dpop_nonce = session.get("dpop_pds_nonce") or ""
    access_token = session["access_token"]

    for _ in range(2):
        dpop_proof = pds_dpop_jwt(method, url, dpop_nonce, access_token, dpop_private_jwk)
        headers = {
            "Authorization": f"DPoP {access_token}",
            "DPoP": dpop_proof,
        }
        if method == "GET":
            resp = await client.get(url, headers=headers)
        else:
            resp = await client.post(url, headers=headers, json=body)

        if is_use_dpop_nonce_error(resp):
            dpop_nonce = resp.headers["DPoP-Nonce"]
            await session_updater(session["did"], "dpop_pds_nonce", dpop_nonce)
            continue
        break

    return resp
