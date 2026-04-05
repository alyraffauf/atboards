from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Static
from textual import work

from tui.widgets.post import Post


class ActivityScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("enter", "open_thread", "open"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._items: list[dict] = []

    def compose(self) -> ComposeResult:
        from tui.widgets.breadcrumb import Breadcrumb

        yield Breadcrumb(
            ("@bbs", 1),
            ("messages", 0),
        )
        with VerticalScroll(id="activity-scroll"):
            yield Static("Messages", classes="title")
            yield Static(
                "Replies to your threads and quotes of your replies.",
                classes="subtitle",
            )
            yield Static("Loading...", id="activity-loading")
        yield Footer()

    def on_mount(self) -> None:
        self.load_inbox()

    def refresh_data(self) -> None:
        for child in list(self.query(Post)):
            child.remove()
        try:
            self.query_one("#activity-loading").remove()
        except Exception:
            pass
        self.query_one("#activity-scroll").mount(
            Static("Loading...", id="activity-loading")
        )
        self.load_inbox()

    def action_open_thread(self) -> None:
        focused = self.focused
        if not isinstance(focused, Post):
            return
        posts = list(self.query(Post))
        try:
            idx = posts.index(focused)
        except ValueError:
            return
        if idx >= len(self._items):
            return
        self._navigate(self._items[idx])

    @work(exclusive=True)
    async def _navigate(self, item: dict) -> None:
        from core.resolver import resolve_bbs
        from core import lexicon
        from core.slingshot import get_record, resolve_identity
        from core.models import AtUri, Thread

        thread = AtUri.parse(item["thread_uri"])
        thread_did = thread.did
        thread_tid = thread.rkey
        handle = item.get("bbs_handle") or self.app.user_session.get("handle", "")

        client = self.app.http_client
        try:
            bbs = await resolve_bbs(client, handle)
            rec = await get_record(client, thread_did, lexicon.THREAD, thread_tid)
            author = await resolve_identity(client, thread_did)
            thread = Thread(
                uri=rec.uri,
                board_uri=rec.value["board"],
                title=rec.value["title"],
                body=rec.value["body"],
                created_at=rec.value["createdAt"],
                author=author,
                updated_at=rec.value.get("updatedAt"),
                attachments=rec.value.get("attachments"),
            )
            from tui.screens.thread import ThreadScreen

            self.app.push_screen(ThreadScreen(bbs, handle, thread))
        except Exception:
            self.notify("Could not open thread.", severity="error")

    @work(exclusive=True)
    async def load_inbox(self) -> None:
        session = self.app.user_session
        if not session:
            try:
                self.query_one("#activity-loading").update(
                    "Log in to see your messages."
                )
            except Exception:
                pass
            return

        from core.records import fetch_inbox

        client = self.app.http_client

        try:
            self._items = await fetch_inbox(client, session["did"], session["pds_url"])
        except Exception:
            self.notify("Failed to fetch messages.", severity="error")
            return

        try:
            self.query_one("#activity-loading").remove()
        except Exception:
            pass

        scroll = self.query_one("#activity-scroll")
        if not self._items:
            await scroll.mount(Static("No messages yet.", classes="subtitle"))
            return

        for a in self._items[:50]:
            title = a["thread_title"] if a["type"] == "reply" else "quoted your reply"
            if a["type"] == "reply":
                title = f"on: {title}"
            await scroll.mount(
                Post(
                    author=a["handle"],
                    date=a["created_at"],
                    title=title,
                    body=a["body"],
                )
            )

        # Focus first post
        try:
            self.query(Post).first().focus()
        except Exception:
            pass
