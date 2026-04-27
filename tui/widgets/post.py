import re
import webbrowser
from urllib.parse import unquote

from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Markdown, Static

from core.models import AtUri
from core.util import (
    attachment_cid,
    blob_url,
    format_datetime_local as format_datetime,
)

ATTACHMENT_LINK_RE = re.compile(r"!?\[([^\]]*)\]\(attachment:([^)\s]+)\)")
ATTACHMENT_REF_RE = re.compile(r"attachment:([^)\s>\"']+)")
BODY_LINK_RE = re.compile(r"!?\[([^\]]+)\]\(([^)\s]+)\)")


def extract_body_links(body: str) -> list[tuple[str, str]]:
    """Return (label, url) for every markdown link in body, in document order."""
    return [
        (match.group(1).strip(), match.group(2))
        for match in BODY_LINK_RE.finditer(body)
    ]


def resolve_attachment_links(
    body: str,
    attachments: list[dict],
    pds: str | None,
    did: str | None,
) -> str:
    """Rewrite [label](attachment:name) markdown links to point at blob URLs."""
    if not attachments or not pds or not did:
        return body
    attachments_by_name = {
        attachment.get("name"): attachment for attachment in attachments
    }

    def replace_match(match: re.Match) -> str:
        label = match.group(1)
        name = unquote(match.group(2))
        attachment = attachments_by_name.get(name)
        cid = attachment_cid(attachment) if attachment else ""
        if not cid:
            return f"[{label or name}] (missing attachment)"
        return f"[{label or name}]({blob_url(pds, did, cid)})"

    return ATTACHMENT_LINK_RE.sub(replace_match, body)


def referenced_attachment_names(body: str) -> set[str]:
    return {unquote(match.group(1)) for match in ATTACHMENT_REF_RE.finditer(body)}


class AttachmentLink(Static, can_focus=True):
    """A clickable attachment that opens in a browser."""

    DEFAULT_CSS = """
    AttachmentLink {
        color: #8a8a8a;
        margin-top: 1;
        width: auto;
    }
    AttachmentLink:hover {
        color: #a3a3a3;
    }
    AttachmentLink:focus {
        color: #e5e5e5;
    }
    """

    def __init__(self, display: str, url: str, **kwargs) -> None:
        super().__init__(display, markup=False, **kwargs)
        self._url = url

    def on_click(self) -> None:
        webbrowser.open(self._url)

    def key_enter(self) -> None:
        webbrowser.open(self._url)


class Post(Widget, can_focus=True):
    """A post card showing author, date, optional title, body, and attachments."""

    DEFAULT_CSS = """
    Post {
        height: auto;
        padding: 1 2;
        margin: 0 0 1 0;
        border: solid #262626;
        background: #1f1f1f;
    }
    Post:focus {
        border: solid #525252;
    }
    Post .post-meta {
        color: #8a8a8a;
        margin-bottom: 1;
    }
    Post .post-title {
        color: #e5e5e5;
        text-style: bold;
        margin-bottom: 1;
    }
    Post .post-body {
        color: #a3a3a3;
    }
    Post .post-attachment {
        color: #8a8a8a;
        margin-top: 1;
    }
    Post .post-parent {
        color: #8a8a8a;
        border-left: solid #525252;
        padding-left: 2;
        margin-bottom: 1;
    }
    """

    def __init__(
        self,
        author: str,
        date: str,
        body: str,
        title: str | None = None,
        author_did: str | None = None,
        author_pds: str | None = None,
        record_uri: str | None = None,
        collection: str | None = None,
        attachments: list[dict] | None = None,
        parent_preview: str | None = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._author = author
        self._date = format_datetime(date)
        self._title = title
        self._body = body
        self.author_did = author_did
        self.author_pds = author_pds
        self.record_uri = record_uri
        self.collection = collection
        self.attachments = attachments or []
        self._parent_preview = parent_preview

    @property
    def rkey(self) -> str | None:
        if self.record_uri:
            return AtUri.parse(self.record_uri).rkey
        return None

    def compose(self) -> ComposeResult:
        yield Static(f"{self._author}  {self._date}", classes="post-meta", markup=False)
        if self._title:
            yield Static(self._title, classes="post-title", markup=False)
        if self._parent_preview:
            yield Markdown(self._parent_preview, classes="post-parent")
        body = resolve_attachment_links(
            self._body, self.attachments, self.author_pds, self.author_did
        )
        yield Markdown(body, classes="post-body")
        for number, (label, url) in enumerate(extract_body_links(body), 1):
            yield AttachmentLink(f"[{number}] {label}", url)
        embedded = referenced_attachment_names(self._body)
        for attachment in self.attachments:
            name = attachment.get("name", "file")
            if name in embedded:
                continue
            cid = attachment_cid(attachment)
            if cid and self.author_pds and self.author_did:
                url = blob_url(self.author_pds, self.author_did, cid)
                yield AttachmentLink(f"[{name}]", url)
            else:
                yield Static(f"[{name}]", classes="post-attachment", markup=False)
