from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer

from core.models import BBS, News
from tui.widgets.post import Post


class NewsScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def __init__(self, bbs: BBS, handle: str, news: News) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.news = news

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb
        yield Breadcrumb(
            ("@bbs", 2),
            (self.bbs.site.name, 1),
            ("news", 0),
        )
        with VerticalScroll():
            yield Post(
                author=self.handle,
                date=self.news.created_at,
                title=self.news.title,
                body=self.news.body,
            )
        yield Footer()
