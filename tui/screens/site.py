from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, ListItem, ListView, Static

from core.models import BBS, Post as PostModel
from core.resolver import resolve_bbs
from core.util import format_datetime_local as format_datetime
from tui.screens.board import BoardScreen
from tui.screens.compose import ComposeNewsScreen
from tui.screens.news import NewsScreen
from tui.screens.sysop import SysopScreen
from tui.util import require_sysop
from tui.widgets.breadcrumb import Breadcrumb


class SiteScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+n", "new_news", "post news"),
        ("ctrl+a", "sysop", "sysop"),
    ]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 1),
            (self.handle, 0),
        )
        with VerticalScroll():
            yield Static(self.bbs.site.name, classes="title")
            yield Static(self.bbs.site.description, classes="subtitle")
            if self.bbs.site.intro:
                yield Static(self.bbs.site.intro, classes="intro", markup=False)
            yield Static("BOARDS", classes="section-label")
            yield ListView(
                *[
                    ListItem(Static(f"  {b.name}  —  {b.description}"), name=b.slug)
                    for b in self.bbs.site.boards
                ],
                id="board-list",
            )
            if self.bbs.news:
                yield Static("NEWS", classes="section-label")
                yield ListView(
                    *[
                        ListItem(
                            Static(
                                f"  {item.title}  —  {format_datetime(item.created_at)}"
                            ),
                            name=str(i),
                        )
                        for i, item in enumerate(self.bbs.news)
                    ],
                    id="news-list",
                )
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#board-list", ListView).focus()

    def refresh_data(self) -> None:
        self._do_refresh()

    @work(exclusive=True)
    async def _do_refresh(self) -> None:
        client = self.app.http_client
        try:
            bbs = await resolve_bbs(client, self.handle)
            self.bbs = bbs
            self.app.pop_screen()
            self.app.push_screen(SiteScreen(bbs, self.handle))
        except Exception:
            self.notify("Could not refresh.", severity="error")

    def action_sysop(self) -> None:
        if not require_sysop(self, self.bbs):
            return
        self.app.push_screen(SysopScreen(self.bbs, self.handle))

    def action_new_news(self) -> None:
        if not require_sysop(self, self.bbs):
            return
        self.app.push_screen(ComposeNewsScreen(self.bbs, self.handle))

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.list_view.id == "board-list":
            slug = event.item.name
            board = next((b for b in self.bbs.site.boards if b.slug == slug), None)
            if board:
                self.app.push_screen(BoardScreen(self.bbs, self.handle, board))
        elif event.list_view.id == "news-list":
            idx = int(event.item.name)
            if 0 <= idx < len(self.bbs.news):
                self.app.push_screen(
                    NewsScreen(self.bbs, self.handle, self.bbs.news[idx])
                )
