import asyncio

from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Input, ListItem, ListView, Static

from core import lexicon
from core.models import AtUri, AuthError, BBS
from core.records import delete_record, list_pds_records
from core.resolver import invalidate_bbs_cache
from core.slingshot import resolve_identities_batch, resolve_identity
from tui.util import ban_user, hide_post, make_session_updater
from tui.widgets.breadcrumb import Breadcrumb


class SysopModerateScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+d", "remove", "remove"),
        ("ctrl+b", "add_ban", "ban"),
        ("ctrl+x", "add_hide", "hide"),
    ]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self._ban_rkeys: dict[str, str] = {}
        self._hide_rkeys: dict[str, str] = {}

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            ("sysop", 1),
            ("moderation", 0),
        )
        with VerticalScroll():
            yield Static("BANNED USERS", classes="section-label")
            yield Input(placeholder="handle or DID to ban", id="ban-input")
            yield ListView(id="ban-list")
            yield Static("HIDDEN POSTS", classes="section-label")
            yield Input(placeholder="at:// URI to hide", id="hide-input")
            yield ListView(id="hide-list")
        yield Footer()

    def on_mount(self) -> None:
        self._load_data()

    @work(exclusive=True)
    async def _load_data(self) -> None:
        client = self.app.http_client
        session = self.app.user_session

        ban_result, hide_result = await asyncio.gather(
            list_pds_records(client, session["pds_url"], session["did"], lexicon.BAN),
            list_pds_records(client, session["pds_url"], session["did"], lexicon.HIDE),
            return_exceptions=True,
        )

        if isinstance(ban_result, BaseException):
            self._ban_rkeys = {}
        else:
            self._ban_rkeys = {
                record["value"]["did"]: AtUri.parse(record["uri"]).rkey
                for record in ban_result
                if record.get("value", {}).get("did")
            }

        if isinstance(hide_result, BaseException):
            self._hide_rkeys = {}
        else:
            self._hide_rkeys = {
                record["value"]["uri"]: AtUri.parse(record["uri"]).rkey
                for record in hide_result
                if record.get("value", {}).get("uri")
            }

        banned_dids = list(self._ban_rkeys.keys())
        banned_handles: dict[str, str] = {}
        if banned_dids:
            try:
                authors = await resolve_identities_batch(client, banned_dids)
                banned_handles = {did: authors[did].handle for did in authors}
            except Exception:
                pass

        ban_list = self.query_one("#ban-list", ListView)
        ban_list.clear()
        for did in banned_dids:
            label = banned_handles.get(did, did)
            await ban_list.append(ListItem(Static(f"  {label}"), name=f"ban:{did}"))

        hide_list = self.query_one("#hide-list", ListView)
        hide_list.clear()
        for uri in self._hide_rkeys:
            await hide_list.append(ListItem(Static(f"  {uri}"), name=f"hide:{uri}"))

        if banned_dids:
            ban_list.focus()
        elif self._hide_rkeys:
            hide_list.focus()

    def action_remove(self) -> None:
        for list_id in ("ban-list", "hide-list"):
            list_view = self.query_one(f"#{list_id}", ListView)
            if list_view.index is not None and list_view.has_focus:
                item = list_view.children[list_view.index]
                if item.name:
                    self._do_remove(item.name, item)
                return

    @work
    async def _do_remove(self, key: str, item) -> None:
        session = self.app.user_session
        updater = make_session_updater(self.app.session_store)

        kind, _, value = key.partition(":")
        try:
            if kind == "ban" and value in self._ban_rkeys:
                rkey = self._ban_rkeys[value]
                await delete_record(
                    self.app.http_client, session, lexicon.BAN, rkey, updater
                )
                del self._ban_rkeys[value]
                self.notify(f"Unbanned {value}.")
            elif kind == "hide" and value in self._hide_rkeys:
                rkey = self._hide_rkeys[value]
                await delete_record(
                    self.app.http_client, session, lexicon.HIDE, rkey, updater
                )
                del self._hide_rkeys[value]
                self.notify("Post unhidden.")
            invalidate_bbs_cache()
            await item.remove()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception:
            self.notify("Could not remove record.", severity="error")

    def action_add_ban(self) -> None:
        identifier = self.query_one("#ban-input", Input).value.strip()
        if not identifier:
            self.notify("Enter a handle or DID.", severity="warning")
            return
        self._do_add_ban(identifier)

    @work
    async def _do_add_ban(self, identifier: str) -> None:
        did = identifier
        if not identifier.startswith("did:"):
            try:
                identity = await resolve_identity(self.app.http_client, identifier)
                did = identity.did
            except Exception:
                self.notify(f"Could not resolve {identifier}.", severity="error")
                return

        if did in self._ban_rkeys:
            self.notify("Already banned.", severity="warning")
            return

        if await ban_user(self, did):
            self.query_one("#ban-input", Input).value = ""
            self._load_data()

    def action_add_hide(self) -> None:
        uri = self.query_one("#hide-input", Input).value.strip()
        if not uri or not uri.startswith("at://"):
            self.notify("Enter a valid AT-URI.", severity="warning")
            return
        self._do_add_hide(uri)

    @work
    async def _do_add_hide(self, uri: str) -> None:
        if uri in self._hide_rkeys:
            self.notify("Already hidden.", severity="warning")
            return

        if await hide_post(self, uri):
            self.query_one("#hide-input", Input).value = ""
            self._load_data()

    def refresh_data(self) -> None:
        self._load_data()
