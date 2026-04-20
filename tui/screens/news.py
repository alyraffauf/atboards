from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer

from core import lexicon
from core.models import AtUri, AuthError, BBS, Post as PostModel
from core.records import delete_record
from tui.util import make_session_updater, require_sysop
from tui.widgets.breadcrumb import Breadcrumb
from tui.widgets.post import Post


class NewsScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+d", "delete", "delete"),
    ]

    def __init__(self, bbs: BBS, handle: str, news: PostModel) -> None:
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
                author_did=self.bbs.identity.did,
                author_pds=self.bbs.identity.pds,
                attachments=self.news.attachments,
            )
        yield Footer()

    def action_delete(self) -> None:
        if not require_sysop(self, self.bbs):
            return
        self._do_delete()

    @work
    async def _do_delete(self) -> None:
        session = self.app.user_session
        updater = make_session_updater(self.app.session_store)
        rkey = AtUri.parse(self.news.uri).rkey
        try:
            await delete_record(
                self.app.http_client,
                session,
                lexicon.POST,
                rkey,
                updater,
            )
            self.app.pop_screen()
            self.notify("News post deleted.")
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception:
            self.notify("Could not delete news post.", severity="error")
