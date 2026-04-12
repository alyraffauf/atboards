import mimetypes
from pathlib import Path

from textual import work
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Footer, Input, Static, TextArea

from core import lexicon, limits
from core.models import AtUri, AuthError, BBS, Board, Reply, Thread
from core.records import (
    create_news_record,
    create_reply_record,
    create_thread_record,
    upload_blob,
)
from tui.util import require_session
from tui.widgets.breadcrumb import Breadcrumb


async def _upload_file(screen, file_path: str, session: dict) -> list[dict] | None:
    """Upload a file and return attachments list, or None on error."""
    p = Path(file_path).expanduser().resolve()
    if not p.exists():
        screen.notify(f"File not found: {p}", severity="error")
        return None
    if not p.is_file():
        screen.notify(f"Not a file: {p}", severity="error")
        return None
    data = p.read_bytes()
    mime = mimetypes.guess_type(str(p))[0] or "application/octet-stream"

    async def _update_nonce(did, field, value):
        if hasattr(screen.app, "user_session") and screen.app.user_session:
            screen.app.user_session[field] = value

    try:
        blob_ref = await upload_blob(
            screen.app.http_client, session, data, mime, session_updater=_update_nonce
        )
        return [{"file": blob_ref, "name": p.name}]
    except Exception as e:
        screen.notify(f"Failed to upload file: {e}", severity="error")
        return None


class ComposeThreadScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+s", "post", "post"),
    ]

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
                id="thread-title",
                max_length=limits.THREAD_TITLE,
            )
            yield TextArea(id="thread-body", language=None)
            yield Input(placeholder="attach file (path, optional)", id="thread-file")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#thread-title", Input).focus()

    def action_post(self) -> None:
        self.post_thread()

    @work(exclusive=True)
    async def post_thread(self) -> None:
        session = require_session(self)
        if not session:
            return

        title = self.query_one("#thread-title", Input).value.strip()
        body = self.query_one("#thread-body", TextArea).text.strip()
        if not title or not body:
            self.notify("Title and body cannot be empty.", severity="error")
            return
        if len(body) > limits.THREAD_BODY:
            self.notify(
                f"Body too long ({len(body)}/{limits.THREAD_BODY}).", severity="error"
            )
            return

        board_uri = str(AtUri(self.bbs.identity.did, lexicon.BOARD, self.board.slug))

        # Handle file attachment
        attachments = []
        file_path = self.query_one("#thread-file", Input).value.strip()
        if file_path:
            attachments = await _upload_file(self, file_path, session)
            if attachments is None:
                return

        try:
            resp = await create_thread_record(
                self.app.http_client,
                session,
                board_uri,
                title,
                body,
                attachments=attachments or None,
            )
            resp.raise_for_status()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
            return
        except Exception as e:
            self.notify(f"Failed to post thread: {e}", severity="error")
            return

        self.app.pop_screen()


class ComposeReplyScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+s", "post", "post"),
        ("ctrl+g", "toggle_quote", "toggle quote"),
    ]

    def __init__(
        self, bbs: BBS, handle: str, thread: Thread, quote: Reply | None = None
    ) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self._original_quote = quote
        self.quote = quote  # Reply object or None
        self.thread = thread

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            (self.thread.title, 1),
            ("reply", 0),
        )
        with Vertical():
            yield Static(f"reply to: {self.thread.title}", classes="title")
            if self.quote:
                body_preview = self.quote.body[:60] + (
                    "..." if len(self.quote.body) > 60 else ""
                )
                yield Static(
                    f"quoting {self.quote.author.handle}: {body_preview}",
                    classes="subtitle",
                    id="quote-info",
                )
            yield TextArea(id="reply-body", language=None)
            yield Input(placeholder="attach file (path, optional)", id="reply-file")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#reply-body", TextArea).focus()

    def action_toggle_quote(self) -> None:
        if not self._original_quote:
            return
        if self.quote:
            self.quote = None
            for w in self.query("#quote-info"):
                w.remove()
        else:
            self.quote = self._original_quote
            body_preview = self.quote.body[:60] + (
                "..." if len(self.quote.body) > 60 else ""
            )
            scroll = self.query_one(Vertical)
            scroll.mount(
                Static(
                    f"quoting {self.quote.author.handle}: {body_preview}",
                    classes="subtitle",
                    id="quote-info",
                ),
                before=self.query_one("#reply-body"),
            )

    def action_post(self) -> None:
        self.post_reply()

    @work(exclusive=True)
    async def post_reply(self) -> None:
        session = require_session(self)
        if not session:
            return

        body = self.query_one("#reply-body", TextArea).text.strip()
        if not body:
            self.notify("Message body cannot be empty.", severity="error")
            return
        if len(body) > limits.REPLY_BODY:
            self.notify(
                f"Body too long ({len(body)}/{limits.REPLY_BODY}).", severity="error"
            )
            return

        # Handle file attachment
        attachments = []
        file_path = self.query_one("#reply-file", Input).value.strip()
        if file_path:
            attachments = await _upload_file(self, file_path, session)
            if attachments is None:
                return

        try:
            resp = await create_reply_record(
                self.app.http_client,
                session,
                self.thread.uri,
                body,
                attachments=attachments or None,
                quote=self.quote.uri if self.quote else None,
            )
            resp.raise_for_status()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
            return
        except Exception as e:
            self.notify(f"Failed to post reply: {e}", severity="error")
            return

        self.app.pop_screen()


class ComposeNewsScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+s", "post", "post"),
    ]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 2),
            (self.bbs.site.name, 1),
            ("news", 0),
        )
        with Vertical():
            yield Static("news", classes="title")
            yield Input(
                placeholder="Title", id="news-title", max_length=limits.NEWS_TITLE
            )
            yield TextArea(id="news-body", language=None)
            yield Input(placeholder="attach file (path, optional)", id="news-file")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#news-title", Input).focus()

    def action_post(self) -> None:
        self.post_news()

    @work(exclusive=True)
    async def post_news(self) -> None:
        session = require_session(self)
        if not session:
            return

        title = self.query_one("#news-title", Input).value.strip()
        body = self.query_one("#news-body", TextArea).text.strip()
        if not title or not body:
            self.notify("Title and body cannot be empty.", severity="error")
            return
        if len(body) > limits.NEWS_BODY:
            self.notify(
                f"Body too long ({len(body)}/{limits.NEWS_BODY}).", severity="error"
            )
            return

        site_uri = str(AtUri(self.bbs.identity.did, lexicon.SITE, "self"))

        # Handle file attachment
        attachments = []
        file_path = self.query_one("#news-file", Input).value.strip()
        if file_path:
            attachments = await _upload_file(self, file_path, session)
            if attachments is None:
                return

        try:
            resp = await create_news_record(
                self.app.http_client,
                session,
                site_uri,
                title,
                body,
                attachments=attachments or None,
            )
            resp.raise_for_status()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
            return
        except Exception as e:
            self.notify(f"Failed to post news: {e}", severity="error")
            return

        self.app.pop_screen()
