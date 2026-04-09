from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer

from core import lexicon
from core.models import AuthError, BBS, News
from core.records import delete_record
from tui.util import make_session_updater
from tui.widgets.breadcrumb import Breadcrumb
from tui.widgets.post import Post


class NewsScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+d", "delete", "delete"),
    ]

    def __init__(self, bbs: BBS, handle: str, news: News) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.news = news

    def compose(self) -> ComposeResult:
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

    def action_delete(self) -> None:
        session = self.app.user_session
        if not session or session["did"] != self.bbs.identity.did:
            self.notify("Only the sysop can delete news.", severity="error")
            return
        self._do_delete()

    @work
    async def _do_delete(self) -> None:
        session = self.app.user_session
        updater = make_session_updater(self.app.session_store)
        try:
            await delete_record(
                self.app.http_client,
                session,
                lexicon.NEWS,
                self.news.tid,
                updater,
            )
            self.app.pop_screen()
            self.notify("News post deleted.")
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception:
            self.notify("Could not delete news post.", severity="error")
