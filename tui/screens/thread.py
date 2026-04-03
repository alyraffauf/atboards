from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Footer
from textual import work

from core.models import BBS, Thread
from tui.fetchers import delete_record, fetch_replies
from tui.widgets.post import Post


class ThreadScreen(Screen):
    BINDINGS = [
        Binding("escape", "app.pop_screen", "back"),
        Binding("ctrl+e", "reply", "reply"),
        Binding("ctrl+d", "delete", "delete"),
    ]

    def __init__(self, bbs: BBS, handle: str, thread: Thread) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.thread = thread
        self.next_cursor: str | None = None

    def compose(self) -> ComposeResult:
        board_slug = self.thread.board_uri.split("/")[-1]
        board_name = next((b.name for b in self.bbs.site.boards if b.slug == board_slug), board_slug)
        from tui.widgets.breadcrumb import Breadcrumb
        yield Breadcrumb(
            ("atboards", 3),
            (self.bbs.site.name, 2),
            (board_name, 1),
            (self.thread.title, 0),
        )
        with VerticalScroll(id="thread-scroll"):
            yield Post(
                author=self.thread.author.handle,
                date=self.thread.created_at,
                title=self.thread.title,
                body=self.thread.body,
                author_did=self.thread.author.did,
                record_uri=self.thread.uri,
                collection="xyz.atboards.thread",
            )
        yield Footer()

    def on_mount(self) -> None:
        try:
            self.query(Post).first().focus()
        except Exception:
            pass
        self.load_replies()

    @work(exclusive=True)
    async def load_replies(self, cursor: str | None = None) -> None:
        client = self.app.http_client
        try:
            replies, self.next_cursor = await fetch_replies(
                client, self.bbs, self.thread, cursor=cursor,
            )
        except Exception:
            self.notify("Failed to load replies.", severity="error")
            return

        scroll = self.query_one("#thread-scroll")

        for r in replies:
            await scroll.mount(
                Post(
                    author=r.author.handle,
                    date=r.created_at,
                    body=r.body,
                    author_did=r.author.did,
                    record_uri=r.uri,
                    collection="xyz.atboards.reply",
                )
            )

        if self.next_cursor:
            await scroll.mount(
                Button("next page →", id="next-page")
            )

    def refresh_data(self) -> None:
        self._do_refresh()

    @work(exclusive=True)
    async def _do_refresh(self) -> None:
        for post in self.query(Post):
            if post.collection == "xyz.atboards.reply":
                await post.remove()
        try:
            await self.query_one("#next-page", Button).remove()
        except Exception:
            pass

        client = self.app.http_client
        try:
            replies, self.next_cursor = await fetch_replies(
                client, self.bbs, self.thread,
            )
        except Exception:
            self.notify("Failed to load replies.", severity="error")
            return

        scroll = self.query_one("#thread-scroll")
        for r in replies:
            await scroll.mount(
                Post(
                    author=r.author.handle,
                    date=r.created_at,
                    body=r.body,
                    author_did=r.author.did,
                    record_uri=r.uri,
                    collection="xyz.atboards.reply",
                )
            )

        if self.next_cursor:
            await scroll.mount(Button("next page →", id="next-page"))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "next-page" and self.next_cursor:
            event.button.remove()
            self.load_replies(cursor=self.next_cursor)

    def action_reply(self) -> None:
        if not self.app.user_session:
            return
        from tui.screens.compose import ComposeReplyScreen
        self.app.push_screen(ComposeReplyScreen(self.bbs, self.handle, self.thread))

    def action_delete(self) -> None:
        session = self.app.user_session
        if not session:
            return

        focused = self.focused
        if not isinstance(focused, Post):
            return

        if focused.author_did != session["did"]:
            return

        self.do_delete(focused)

    @work(exclusive=True)
    async def do_delete(self, post: Post) -> None:
        session = self.app.user_session
        try:
            await delete_record(
                self.app.http_client, session, post.collection, post.rkey,
            )
        except Exception:
            self.notify("Failed to delete.", severity="error")
            return

        if post.collection == "xyz.atboards.thread":
            self.app.pop_screen()
        else:
            await post.remove()
