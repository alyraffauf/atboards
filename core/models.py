from dataclasses import dataclass


class AtUri:
    """Parsed AT URI with did, collection, and rkey fields."""

    __slots__ = ("did", "collection", "rkey")

    def __init__(self, did: str, collection: str, rkey: str):
        self.did = did
        self.collection = collection
        self.rkey = rkey

    @classmethod
    def parse(cls, uri: str) -> "AtUri":
        if not uri.startswith("at://"):
            raise ValueError(f"not an AT URI: {uri!r}")
        parts = uri[5:].split("/")
        if len(parts) != 3 or not all(parts):
            raise ValueError(f"malformed AT URI: {uri!r}")
        return cls(*parts)

    def __str__(self) -> str:
        return f"at://{self.did}/{self.collection}/{self.rkey}"

    def __eq__(self, other):
        if isinstance(other, AtUri):
            return str(self) == str(other)
        if isinstance(other, str):
            return str(self) == other
        return NotImplemented

    def __hash__(self):
        return hash(str(self))


def make_at_uri(did: str, collection: str, rkey: str) -> str:
    """Build an AT URI string from its components."""
    return f"at://{did}/{collection}/{rkey}"


# errors


class BBSNotFoundError(Exception):
    """Handle could not be resolved."""


class NoBBSError(Exception):
    """Handle resolved but has no site record."""


class NetworkError(Exception):
    """Slingshot or Constellation is unreachable."""


class AuthError(Exception):
    """Session expired and token refresh failed."""


# microcosm response types


@dataclass
class MiniDoc:
    did: str
    handle: str
    pds: str | None = None
    signing_key: str | None = None


@dataclass
class BacklinkRef:
    """A single backlink from Constellation (record locator, no content)."""

    did: str
    collection: str
    rkey: str

    @property
    def uri(self) -> str:
        return f"at://{self.did}/{self.collection}/{self.rkey}"


@dataclass
class BacklinksResponse:
    """Full Constellation getBacklinks response."""

    total: int
    records: list[BacklinkRef]
    cursor: str | None = None


@dataclass
class Record:
    """A single record from Slingshot getRecord."""

    uri: str
    cid: str
    value: dict


# lexicons


@dataclass
class Board:
    """xyz.atbbs.board — a subforum defined by the sysop."""

    slug: str
    name: str
    description: str
    created_at: str
    updated_at: str | None = None


@dataclass
class Post:
    """xyz.atbbs.post — a thread, reply, or news item."""

    uri: str
    scope: str
    body: str
    created_at: str
    author: MiniDoc
    title: str | None = None
    root: str | None = None
    parent: str | None = None
    updated_at: str | None = None
    attachments: list[dict] | None = None
    last_activity_at: str | None = None

    @property
    def is_root(self) -> bool:
        return self.root is None


@dataclass
class Site:
    """xyz.atbbs.site/self — the BBS front door."""

    name: str
    description: str
    intro: str
    boards: list[Board]
    created_at: str
    updated_at: str | None = None


@dataclass
class BBS:
    """Fully resolved BBS: resolve_bbs(handle)."""

    identity: MiniDoc
    site: Site
    news: list[Post]
