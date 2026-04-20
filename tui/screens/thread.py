import asyncio
from pathlib import Path

from platformdirs import user_downloads_dir
from textual import work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Static

from core import lexicon
from core.models import BBS, AtUri, AuthError, Post as PostModel
from core.records import delete_record, hydrate_replies as fetch_replies, post_from_record
from core.slingshot import get_record, resolve_identity
from tui.screens.compose import ComposeReplyScreen
from tui.util import ban_user, hide_post, require_session, require_sysop
from tui.widgets.breadcrumb import Breadcrumb
from tui.widgets.post import Post


class ThreadScreen(Screen):
    BINDINGS = [
        Binding("escape", "app.pop_screen", "back"),
        Binding("ctrl+e", "reply", "reply"),
        Binding("ctrl+d", "delete", "delete"),
        Binding("[", "prev_page", "prev page"),
        Binding("]", "next_page", "next page"),
        Binding("ctrl+s", "save_attachment", "save attachments", show=False),
        Binding("ctrl+h", "hide", "hide post", show=False),
        Binding("ctrl+b", "ban", "ban user", show=False),
    ]

    def __init__(
        self, bbs: BBS, handle: str, thread: PostModel, focus_reply: str | None = None
    ) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self.thread = thread
        self._focus_reply = focus_reply
        self._page: int = 1
        self._total_pages: int = 1
        self._replies_map: dict[str, PostModel] = {}

    def compose(self) -> ComposeResult:
        scope_parsed = AtUri.parse(self.thread.scope)
        board_slug = scope_parsed.rkey
        board_name = next(
            (b.name for b in self.bbs.site.boards if b.slug == board_slug), board_slug
        )
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            (board_name, 1),
            (self.thread.title or "", 0),
        )
        with VerticalScroll(id="thread-scroll"):
            yield Post(
                author=self.thread.author.handle,
                date=self.thread.created_at,
                title=self.thread.title,
                body=self.thread.body,
                author_did=self.thread.author.did,
                author_pds=self.thread.author.pds,
                record_uri=self.thread.uri,
                collection=lexicon.POST,
                attachments=self.thread.attachments,
            )
            yield Static("", id="page-status-top", classes="page-status")
            yield Static("", id="page-status-bottom", classes="page-status")
        yield Footer()

    def on_mount(self) -> None:
        posts = list(self.query(Post))
        if posts:
            posts[0].focus()
        self.load_replies(focus_reply=self._focus_reply)
        self._focus_reply = None

    def _update_page_status(self) -> None:
        text = (
            f"page {self._page} of {self._total_pages}" if self._total_pages > 1 else ""
        )
        self.query_one("#page-status-top", Static).update(text)
        self.query_one("#page-status-bottom", Static).update(text)

    def _is_reply_widget(self, post: Post) -> bool:
        return post.record_uri is not None and post.record_uri != self.thread.uri

    def _clear_replies(self) -> None:
        for post in self.query(Post):
            if self._is_reply_widget(post):
                post.remove()

    @work(exclusive=True)
    async def load_replies(self, page: int = 1, focus_reply: str | None = None) -> None:
        client = self.app.http_client
        try:
            result = await fetch_replies(
                client,
                self.bbs,
                self.thread.uri,
                page=page,
                focus_reply=focus_reply,
            )
        except Exception:
            self.notify("Could not fetch replies.", severity="error")
            return

        self._page = result.page
        self._total_pages = result.total_pages
        self._update_page_status()

        scroll = self.query_one("#thread-scroll")

        for reply in result.replies:
            self._replies_map[reply.uri] = reply

        # Fetch any parent replies not already known (in parallel)
        missing_parents = [
            reply.parent
            for reply in result.replies
            if reply.parent and reply.parent not in self._replies_map
        ]

        async def fetch_parent(uri: str):
            parsed = AtUri.parse(uri)
            record, author = await asyncio.gather(
                get_record(client, parsed.did, parsed.collection, parsed.rkey),
                resolve_identity(client, parsed.did),
            )
            return uri, post_from_record(record, author)

        if missing_parents:
            parent_results = await asyncio.gather(
                *[fetch_parent(uri) for uri in missing_parents],
                return_exceptions=True,
            )
            for parent_result in parent_results:
                if isinstance(parent_result, tuple):
                    self._replies_map[parent_result[0]] = parent_result[1]

        for reply in result.replies:
            parent_preview = None
            if reply.parent and reply.parent in self._replies_map:
                parent_post = self._replies_map[reply.parent]
                body_preview = parent_post.body[:200] + (
                    "..." if len(parent_post.body) > 200 else ""
                )
                parent_preview = f"{parent_post.author.handle}: {body_preview}"

            await scroll.mount(
                Post(
                    author=reply.author.handle,
                    date=reply.created_at,
                    body=reply.body,
                    author_did=reply.author.did,
                    author_pds=reply.author.pds,
                    record_uri=reply.uri,
                    collection=lexicon.POST,
                    attachments=reply.attachments,
                    parent_preview=parent_preview,
                ),
                before=self.query_one("#page-status-bottom"),
            )

        # Focus first reply
        replies = [
            post for post in self.query(Post) if self._is_reply_widget(post)
        ]
        if replies:
            replies[0].focus()

    def action_ban(self) -> None:
        if not require_sysop(self, self.bbs):
            return
        focused = self.focused
        if not isinstance(focused, Post) or not focused.author_did:
            return
        if focused.author_did == self.app.user_session["did"]:
            self.notify("Cannot ban yourself.", severity="warning")
            return
        self._do_ban(focused.author_did)

    @work
    async def _do_ban(self, did: str) -> None:
        await ban_user(self, did)

    def action_hide(self) -> None:
        if not require_sysop(self, self.bbs):
            return
        focused = self.focused
        if not isinstance(focused, Post) or not focused.record_uri:
            return
        self._do_hide(focused)

    @work
    async def _do_hide(self, post: Post) -> None:
        if await hide_post(self, post.record_uri):
            await post.remove()

    def action_next_page(self) -> None:
        if self._page < self._total_pages:
            self._clear_replies()
            self.load_replies(page=self._page + 1)

    def action_prev_page(self) -> None:
        if self._page > 1:
            self._clear_replies()
            self.load_replies(page=self._page - 1)

    def refresh_data(self) -> None:
        self._clear_replies()
        self._page = 1
        self.load_replies(page=1)

    def action_reply(self) -> None:
        session = require_session(self)
        if not session:
            return

        # If focused on a reply, set it as the parent
        parent = None
        focused = self.focused
        if (
            isinstance(focused, Post)
            and self._is_reply_widget(focused)
            and focused.record_uri
        ):
            parent = self._replies_map.get(focused.record_uri)

        self.app.push_screen(
            ComposeReplyScreen(self.bbs, self.handle, self.thread, parent=parent)
        )

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
                self.app.http_client,
                session,
                lexicon.POST,
                post.rkey,
            )
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
            return
        except Exception:
            self.notify("Failed to delete.", severity="error")
            return

        if post.record_uri == self.thread.uri:
            self.app.pop_screen()
        else:
            await post.remove()

    def action_save_attachment(self) -> None:
        focused = self.focused
        if not isinstance(focused, Post) or not focused.attachments:
            self.notify("No attachments on this post.", severity="warning")
            return
        self._do_save(focused)

    @work(exclusive=True)
    async def _do_save(self, post: Post) -> None:
        downloads = Path(user_downloads_dir())
        downloads.mkdir(parents=True, exist_ok=True)

        client = self.app.http_client
        for att in post.attachments:
            name = att.get("name", "file")
            cid = att.get("file", {}).get("ref", {}).get("$link", "")
            if not cid or not post.author_pds or not post.author_did:
                continue

            url = f"{post.author_pds}/xrpc/com.atproto.sync.getBlob?did={post.author_did}&cid={cid}"
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                path = downloads / name
                if path.exists():
                    stem, suffix = path.stem, path.suffix
                    i = 1
                    while path.exists():
                        path = downloads / f"{stem}_{i}{suffix}"
                        i += 1
                path.write_bytes(resp.content)
                self.notify(f"Saved to {path}")
            except Exception:
                self.notify(f"Failed to download {name}.", severity="error")
