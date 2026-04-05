import webbrowser

from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Static

from core.models import AtUri
from tui.util import format_datetime


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

    def __init__(self, name: str, url: str, **kwargs) -> None:
        super().__init__(f"[{name}]", markup=False, **kwargs)
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
    Post .post-quote {
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
        quote_text: str | None = None,
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
        self._quote_text = quote_text

    @property
    def rkey(self) -> str | None:
        if self.record_uri:
            return AtUri.parse(self.record_uri).rkey
        return None

    def compose(self) -> ComposeResult:
        yield Static(f"{self._author}  {self._date}", classes="post-meta", markup=False)
        if self._title:
            yield Static(self._title, classes="post-title", markup=False)
        if self._quote_text:
            yield Static(self._quote_text, classes="post-quote", markup=False)
        yield Static(self._body, classes="post-body", markup=False)
        for att in self.attachments:
            name = att.get("name", "file")
            cid = att.get("file", {}).get("ref", {}).get("$link", "")
            if cid and self.author_pds and self.author_did:
                url = f"{self.author_pds}/xrpc/com.atproto.sync.getBlob?did={self.author_did}&cid={cid}"
                yield AttachmentLink(name, url)
            else:
                yield Static(f"[{name}]", classes="post-attachment", markup=False)
