from dataclasses import dataclass


# errors


class BBSNotFoundError(Exception):
    """Handle could not be resolved."""


class NoBBSError(Exception):
    """Handle resolved but has no site record."""


class NetworkError(Exception):
    """Slingshot or Constellation is unreachable."""


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
    """xyz.atboards.board — a subforum defined by the sysop."""

    slug: str
    name: str
    description: str
    created_at: str
    updated_at: str | None = None


@dataclass
class News:
    """xyz.atboards.news — a sysop announcement."""

    tid: str
    site_uri: str
    title: str
    body: str
    created_at: str


@dataclass
class Site:
    """xyz.atboards.site/self — the BBS front door."""

    name: str
    description: str
    intro: str
    boards: list[Board]
    banned_dids: set[str]
    hidden_posts: set[str]
    created_at: str
    updated_at: str | None = None

    def is_banned(self, did: str) -> bool:
        return did in self.banned_dids


@dataclass
class Thread:
    """xyz.atboards.thread — a user's thread on a board."""

    uri: str
    board_uri: str
    title: str
    body: str
    created_at: str
    author: MiniDoc
    updated_at: str | None = None
    attachments: list[dict] | None = None


@dataclass
class Reply:
    """xyz.atboards.reply — a user's reply to a thread."""

    uri: str
    subject_uri: str
    body: str
    created_at: str
    author: MiniDoc
    updated_at: str | None = None
    attachments: list[dict] | None = None
    quote: str | None = None


@dataclass
class BBS:
    """Fully resolved BBS: resolve_bbs(handle)."""

    identity: MiniDoc
    site: Site
    news: list[News]
