from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Footer, Input, Static, TextArea

from core import lexicon, limits
from core.models import BBS, make_at_uri
from tui.screens.compose.base import ComposeScreen
from tui.widgets.breadcrumb import Breadcrumb


class ComposeNewsScreen(ComposeScreen):
    requires_title = True
    post_type = "news"

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 2),
            (self.bbs.site.name, 1),
            ("news", 0),
        )
        with Vertical():
            yield Static("news", classes="title")
            yield Input(
                placeholder="Title", id="compose-title", max_length=limits.POST_TITLE
            )
            yield TextArea(id="compose-body", language=None)
            yield Input(placeholder="attach file (path, optional)", id="compose-file")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#compose-title", Input).focus()

    def get_post_params(self, title: str | None, body: str) -> dict:
        site_uri = make_at_uri(self.bbs.identity.did, lexicon.SITE, "self")
        return {"scope": site_uri, "body": body, "title": title}
