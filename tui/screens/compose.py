from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Footer, Input, Static, TextArea
from textual import work

from core.records import create_thread_record, create_reply_record


class ComposeThreadScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def __init__(self, bbs, handle: str, board) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.board = board

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb
        yield Breadcrumb(
            ("atboards", 3),
            (self.bbs.site.name, 2),
            (self.board.name, 1),
            ("new thread", 0),
        )
        with Vertical():
            yield Static("new thread", classes="title")
            yield Input(placeholder="Thread title", id="thread-title")
            yield TextArea(id="thread-body", language=None)
            yield Static("ctrl+s to post", classes="subtitle")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#thread-title", Input).focus()

    def key_ctrl_s(self) -> None:
        self.post_thread()

    @work(exclusive=True)
    async def post_thread(self) -> None:
        session = self.app.user_session
        if not session:
            self.notify("Not logged in.", severity="error")
            return

        title = self.query_one("#thread-title", Input).value.strip()
        body = self.query_one("#thread-body", TextArea).text.strip()
        if not title or not body:
            self.notify("Title and body are required.", severity="error")
            return

        board_uri = f"at://{self.bbs.identity.did}/xyz.atboards.board/{self.board.slug}"

        try:
            resp = await create_thread_record(
                self.app.http_client, session, board_uri, title, body,
            )
            resp.raise_for_status()
        except Exception as e:
            self.notify(f"Failed to post thread: {e}", severity="error")
            return

        self.app.pop_screen()


class ComposeReplyScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def __init__(self, bbs, handle: str, thread) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.thread = thread

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb
        yield Breadcrumb(
            ("atboards", 3),
            (self.bbs.site.name, 2),
            (self.thread.title, 1),
            ("reply", 0),
        )
        with Vertical():
            yield Static(f"reply to: {self.thread.title}", classes="title")
            yield TextArea(id="reply-body", language=None)
            yield Static("ctrl+s to post", classes="subtitle")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#reply-body", TextArea).focus()

    def key_ctrl_s(self) -> None:
        self.post_reply()

    @work(exclusive=True)
    async def post_reply(self) -> None:
        session = self.app.user_session
        if not session:
            self.notify("Not logged in.", severity="error")
            return

        body = self.query_one("#reply-body", TextArea).text.strip()
        if not body:
            self.notify("Reply body is required.", severity="error")
            return

        try:
            resp = await create_reply_record(
                self.app.http_client, session, self.thread.uri, body,
            )
            resp.raise_for_status()
        except Exception as e:
            self.notify(f"Failed to post reply: {e}", severity="error")
            return

        self.app.pop_screen()
