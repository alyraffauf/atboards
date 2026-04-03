from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Static

from tui.util import format_datetime


class Post(Widget, can_focus=True):
    """A post card showing author, date, optional title, and body."""

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
    """

    def __init__(
        self,
        author: str,
        date: str,
        body: str,
        title: str | None = None,
        author_did: str | None = None,
        record_uri: str | None = None,
        collection: str | None = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._author = author
        self._date = format_datetime(date)
        self._title = title
        self._body = body
        self.author_did = author_did
        self.record_uri = record_uri
        self.collection = collection

    @property
    def rkey(self) -> str | None:
        if self.record_uri:
            return self.record_uri.split("/")[-1]
        return None

    def compose(self) -> ComposeResult:
        yield Static(f"{self._author}  {self._date}", classes="post-meta", markup=False)
        if self._title:
            yield Static(self._title, classes="post-title", markup=False)
        yield Static(self._body, classes="post-body", markup=False)
