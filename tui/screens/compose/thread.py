from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Footer, Input, Static, TextArea

from core import lexicon, limits
from core.models import BBS, Board, make_at_uri
from tui.screens.compose.base import ComposeScreen
from tui.widgets.breadcrumb import Breadcrumb


class ComposeThreadScreen(ComposeScreen):
    requires_title = True
    post_type = "thread"

    def __init__(self, bbs: BBS, handle: str, board: Board) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.board = board

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            (self.board.name, 1),
            ("new thread", 0),
        )
        with Vertical():
            yield Static("new thread", classes="title")
            yield Input(
                placeholder="Thread title",
                id="compose-title",
                max_length=limits.POST_TITLE,
            )
            yield TextArea(id="compose-body", language=None)
            yield Input(placeholder="attach file (path, optional)", id="compose-file")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#compose-title", Input).focus()

    def get_post_params(self, title: str | None, body: str) -> dict:
        board_uri = make_at_uri(self.bbs.identity.did, lexicon.BOARD, self.board.slug)
        return {"scope": board_uri, "body": body, "title": title}
