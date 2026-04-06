from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, ListItem, ListView, Static
from textual import work

from core.models import BBS
from core.resolver import resolve_bbs
from tui.util import format_datetime


class SiteScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb

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

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.list_view.id == "board-list":
            slug = event.item.name
            board = next((b for b in self.bbs.site.boards if b.slug == slug), None)
            if board:
                from tui.screens.board import BoardScreen

                self.app.push_screen(BoardScreen(self.bbs, self.handle, board))
        elif event.list_view.id == "news-list":
            idx = int(event.item.name)
            if 0 <= idx < len(self.bbs.news):
                from tui.screens.news import NewsScreen

                self.app.push_screen(
                    NewsScreen(self.bbs, self.handle, self.bbs.news[idx])
                )
