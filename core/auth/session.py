"""OAuth session storage using SQLite. Framework-agnostic."""

import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS oauth_auth_request (
    state TEXT NOT NULL PRIMARY KEY,
    authserver_iss TEXT NOT NULL,
    did TEXT,
    handle TEXT,
    pds_url TEXT,
    pkce_verifier TEXT NOT NULL,
    scope TEXT NOT NULL,
    dpop_authserver_nonce TEXT NOT NULL,
    dpop_private_jwk TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_session (
    did TEXT NOT NULL PRIMARY KEY,
    handle TEXT,
    pds_url TEXT NOT NULL,
    authserver_iss TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    dpop_authserver_nonce TEXT NOT NULL,
    dpop_pds_nonce TEXT,
    dpop_private_jwk TEXT NOT NULL
);
"""


class SessionStore:
    """SQLite-backed OAuth session store."""

    def __init__(self, db_path: str = "atboards.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        con = sqlite3.connect(self.db_path)
        con.executescript(SCHEMA)
        con.close()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        return con

    # --- Auth requests (temporary, during login flow) ---

    def save_auth_request(self, **kwargs):
        con = self._connect()
        con.execute(
            """INSERT OR REPLACE INTO oauth_auth_request
               (state, authserver_iss, did, handle, pds_url, pkce_verifier,
                scope, dpop_authserver_nonce, dpop_private_jwk)
               VALUES (:state, :authserver_iss, :did, :handle, :pds_url,
                       :pkce_verifier, :scope, :dpop_authserver_nonce, :dpop_private_jwk)""",
            kwargs,
        )
        con.commit()
        con.close()

    def get_auth_request(self, state: str) -> dict | None:
        con = self._connect()
        row = con.execute(
            "SELECT * FROM oauth_auth_request WHERE state = ?", [state]
        ).fetchone()
        con.close()
        return dict(row) if row else None

    def delete_auth_request(self, state: str):
        con = self._connect()
        con.execute("DELETE FROM oauth_auth_request WHERE state = ?", [state])
        con.commit()
        con.close()

    # --- Sessions (persistent, per logged-in user) ---

    def save_session(self, **kwargs):
        con = self._connect()
        con.execute(
            """INSERT OR REPLACE INTO oauth_session
               (did, handle, pds_url, authserver_iss, access_token, refresh_token,
                dpop_authserver_nonce, dpop_pds_nonce, dpop_private_jwk)
               VALUES (:did, :handle, :pds_url, :authserver_iss, :access_token,
                       :refresh_token, :dpop_authserver_nonce, :dpop_pds_nonce,
                       :dpop_private_jwk)""",
            kwargs,
        )
        con.commit()
        con.close()

    def get_session(self, did: str) -> dict | None:
        con = self._connect()
        row = con.execute(
            "SELECT * FROM oauth_session WHERE did = ?", [did]
        ).fetchone()
        con.close()
        return dict(row) if row else None

    ALLOWED_FIELDS = {"dpop_pds_nonce", "dpop_authserver_nonce", "access_token", "refresh_token"}

    def update_session_field(self, did: str, field: str, value: str):
        if field not in self.ALLOWED_FIELDS:
            raise ValueError(f"Invalid field: {field}")
        con = self._connect()
        con.execute(
            f"UPDATE oauth_session SET {field} = ? WHERE did = ?", [value, did]
        )
        con.commit()
        con.close()

    def update_session_tokens(self, did: str, access_token: str, refresh_token: str, dpop_nonce: str):
        con = self._connect()
        con.execute(
            """UPDATE oauth_session
               SET access_token = ?, refresh_token = ?, dpop_authserver_nonce = ?
               WHERE did = ?""",
            [access_token, refresh_token, dpop_nonce, did],
        )
        con.commit()
        con.close()

    def delete_session(self, did: str):
        con = self._connect()
        con.execute("DELETE FROM oauth_session WHERE did = ?", [did])
        con.commit()
        con.close()
