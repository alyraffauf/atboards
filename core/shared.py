"""Loader for the cross-language shared data file (data/shared.json).

Dev checkout: reads from <repo>/data/shared.json.
Installed wheel: reads from core/_shared.json (bundled via hatch force-include).
"""

import json
from pathlib import Path
from typing import Any


def _find_shared_json() -> Path:
    here = Path(__file__).resolve().parent
    candidates = [
        here / "_shared.json",
        here.parent / "data" / "shared.json",
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(
        f"shared data file not found; looked in: {', '.join(str(p) for p in candidates)}"
    )


_DATA: dict[str, Any] = json.loads(_find_shared_json().read_text())

ATPROTO_APPS: list[dict[str, str]] = _DATA["atproto_apps"]
LEXICON_COLLECTIONS: dict[str, str] = _DATA["lexicon_collections"]
OAUTH_BASE_SCOPES: list[str] = _DATA["oauth_base_scopes"]
SERVICES: dict[str, str] = _DATA["services"]
CDN: dict[str, str] = _DATA["cdn"]
DEFAULT_BOARD: dict[str, str] = _DATA["default_board"]
HANDLE_PLACEHOLDERS: list[str] = _DATA["handle_placeholders"]
