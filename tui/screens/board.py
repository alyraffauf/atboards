from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Footer, ListItem, ListView, Static

from core.models import BBS, Board
from core.records import hydrate_threads as fetch_threads
from tui.util import require_session
from tui.util import format_datetime


class BoardScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+n", "new_thread", "new thread"),
    ]

    DEFAULT_CSS = """
    BoardScreen ListView {
        height: auto;
    }
    """

    def __init__(self, bbs: BBS, handle: str, board: Board) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.board = board
        self.threads = []
        self.cursor_history: list[str | None] = [None]
        self.page = 0

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb

        yield Breadcrumb(
            ("@bbs", 2),
            (self.bbs.site.name, 1),
            (self.board.name, 0),
        )
        with VerticalScroll():
            yield Static("")
            yield Static(
                f"{self.board.name} — {self.board.description}", classes="subtitle"
            )
            yield ListView(id="thread-list")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#thread-list", ListView).focus()
        self.load_threads()

    @work(exclusive=True)
    async def load_threads(self) -> None:
        client = self.app.http_client
        cursor = self.cursor_history[self.page]
        try:
            self.threads, next_cursor = await fetch_threads(
                client,
                self.bbs,
                self.board,
                cursor=cursor,
            )
        except Exception:
            self.notify("Could not fetch threads.", severity="error")
            return

        lv = self.query_one("#thread-list", ListView)
        lv.clear()
        for t in self.threads:
            label = (
                f"  {t.title}  —  {t.author.handle} · {format_datetime(t.created_at)}"
            )
            await lv.append(ListItem(Static(label), name=t.uri))

        if self.threads:
            lv.index = 0

        # Remove old next page button if present
        try:
            await self.query_one("#next-page", Button).remove()
        except Exception:
            pass

        if next_cursor:
            if self.page + 1 >= len(self.cursor_history):
                self.cursor_history.append(next_cursor)
            scroll = self.query_one(VerticalScroll)
            await scroll.mount(Button("next page →", id="next-page"))

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        uri = event.item.name
        # Find thread by URI
        thread = next((t for t in self.threads if t.uri == uri), None)
        if thread:
            from tui.screens.thread import ThreadScreen

            self.app.push_screen(ThreadScreen(self.bbs, self.handle, thread))

    def refresh_data(self) -> None:
        self.page = 0
        self.cursor_history = [None]
        self.load_threads()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "next-page":
            self.page += 1
            self.load_threads()

    def action_new_thread(self) -> None:
        if not require_session(self):
            return
        from tui.screens.compose import ComposeThreadScreen

        self.app.push_screen(ComposeThreadScreen(self.bbs, self.handle, self.board))
