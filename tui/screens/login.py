import json
import webbrowser
from urllib.parse import quote, urlencode

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Footer, Input, Static
from textual import work

from authlib.jose import JsonWebKey

from core.auth.config import load_secrets
from core.auth.oauth import (
    exchange_code,
    fetch_authserver_meta,
    resolve_pds_authserver,
    send_par_request,
)
from core.slingshot import resolve_identity
from tui.local_server import wait_for_callback


OAUTH_SCOPE = "atproto transition:generic collection:xyz.atboards.site collection:xyz.atboards.board collection:xyz.atboards.news collection:xyz.atboards.thread collection:xyz.atboards.reply"
CALLBACK_PORT = 23847


class LoginScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb
        yield Breadcrumb(
            ("atboards", 1),
            ("log in", 0),
        )
        with Vertical():
            yield Static("log in", classes="title")
            yield Static("Sign in with your atproto handle. A browser window will open.", classes="subtitle")
            yield Input(placeholder="your-handle.bsky.social", id="login-handle")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#login-handle", Input).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "login-handle":
            handle = event.value.strip()
            if handle:
                self.do_login(handle)

    @work(exclusive=True)
    async def do_login(self, handle: str) -> None:
        client = self.app.http_client

        # Resolve identity
        try:
            identity = await resolve_identity(client, handle)
        except Exception:
            self.notify("Could not resolve handle.", severity="error")
            return

        pds_url = identity.pds
        if not pds_url:
            self.notify("Could not find PDS for this handle.", severity="error")
            return

        # Load client secrets from TUI data dir
        from tui.app import DATA_DIR
        secrets = load_secrets(DATA_DIR)
        client_secret_jwk = json.loads(secrets["client_secret_jwk"])

        # Build loopback client ID
        redirect_uri = f"http://127.0.0.1:{CALLBACK_PORT}/oauth/callback"
        client_id = "http://localhost?" + urlencode(
            {"redirect_uri": redirect_uri, "scope": OAUTH_SCOPE}
        )

        # Discover auth server
        try:
            authserver_url = await resolve_pds_authserver(client, pds_url)
            authserver_meta = await fetch_authserver_meta(client, authserver_url)
        except Exception:
            self.notify("Could not discover auth server.", severity="error")
            return

        # Generate DPoP keypair
        dpop_key = JsonWebKey.generate_key("EC", "P-256", is_private=True)
        dpop_private_jwk_json = dpop_key.as_json(is_private=True)

        # Send PAR
        try:
            pkce_verifier, state, dpop_nonce, par_resp = await send_par_request(
                client=client,
                authserver_url=authserver_url,
                authserver_meta=authserver_meta,
                login_hint=handle,
                client_id=client_id,
                redirect_uri=redirect_uri,
                scope=OAUTH_SCOPE,
                client_secret_jwk=client_secret_jwk,
                dpop_private_jwk=dpop_key,
            )
        except Exception:
            self.notify("Authorization request failed.", severity="error")
            return

        # Open browser and wait for callback
        auth_url = authserver_meta["authorization_endpoint"]
        browser_url = f"{auth_url}?client_id={quote(client_id, safe='')}&request_uri={quote(par_resp['request_uri'], safe='')}"
        webbrowser.open(browser_url)
        self.notify("Opened browser. Complete login there.")

        try:
            callback = await wait_for_callback(port=CALLBACK_PORT)
        except Exception:
            self.notify("Failed to receive callback.", severity="error")
            return

        if not callback.get("code") or callback.get("state") != state:
            self.notify("Login failed. Try again.", severity="error")
            return

        # Exchange code for tokens
        auth_request = {
            "authserver_iss": authserver_url,
            "dpop_private_jwk": dpop_private_jwk_json,
            "dpop_authserver_nonce": dpop_nonce,
            "pkce_verifier": pkce_verifier,
        }

        try:
            token_resp, final_dpop_nonce = await exchange_code(
                client=client,
                auth_request=auth_request,
                code=callback["code"],
                client_id=client_id,
                redirect_uri=redirect_uri,
                client_secret_jwk=client_secret_jwk,
            )
        except Exception:
            self.notify("Token exchange failed.", severity="error")
            return

        # Store session persistently
        session_data = {
            "did": identity.did,
            "handle": identity.handle,
            "pds_url": pds_url,
            "access_token": token_resp["access_token"],
            "refresh_token": token_resp.get("refresh_token", ""),
            "authserver_iss": authserver_url,
            "dpop_authserver_nonce": final_dpop_nonce,
            "dpop_pds_nonce": "",
            "dpop_private_jwk": dpop_private_jwk_json,
        }
        self.app.session_store.save_session(**session_data)
        self.app.user_session = session_data

        self.notify(f"Logged in as {identity.handle}.")
        self.app.pop_screen()
