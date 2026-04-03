"""Client key generation and persistence."""

import json
import os
import time
from pathlib import Path

from authlib.jose import JsonWebKey


def _generate_secret_key() -> str:
    return os.urandom(32).hex()


def _generate_client_jwk() -> str:
    key = JsonWebKey.generate_key("EC", "P-256", is_private=True)
    key_dict = json.loads(key.as_json(is_private=True))
    key_dict["kid"] = f"atboards-{int(time.time())}"
    return json.dumps(key_dict)


def load_secrets(data_dir: str = ".") -> dict:
    """Load or generate secrets. Returns dict with secret_key and client_secret_jwk."""
    secrets_path = Path(data_dir) / "secrets.json"

    if secrets_path.exists():
        return json.loads(secrets_path.read_text())

    secrets = {
        "secret_key": _generate_secret_key(),
        "client_secret_jwk": _generate_client_jwk(),
    }
    secrets_path.write_text(json.dumps(secrets, indent=2))
    return secrets
