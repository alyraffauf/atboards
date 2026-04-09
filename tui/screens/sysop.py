from textual import work
from textual.app import ComposeResult
from textual.containers import Vertical, VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Footer, Input, ListItem, ListView, Static, TextArea

from core import lexicon
from core.models import AtUri, AuthError, BBS
from core.records import (
    create_ban_record,
    create_hidden_record,
    delete_record,
    list_pds_records,
    put_board_record,
    put_site_record,
)
from core.constellation import get_news
from core.slingshot import resolve_identities_batch, resolve_identity
from core.util import now_iso
from tui.util import make_session_updater, require_session
from tui.widgets.breadcrumb import Breadcrumb


class SysopScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "back")]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        yield ListView(
            ListItem(Static("  Edit BBS"), name="edit"),
            ListItem(Static("  Moderation"), name="moderate"),
            ListItem(Static("  Delete BBS"), name="delete"),
            id="sysop-menu",
        )
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#sysop-menu", ListView).focus()

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        name = event.item.name
        if name == "edit":
            self.app.push_screen(SysopEditScreen(self.bbs, self.handle))
        elif name == "moderate":
            self.app.push_screen(SysopModerateScreen(self.bbs, self.handle))
        elif name == "delete":
            self.app.push_screen(SysopDeleteScreen(self.bbs, self.handle))


class SysopEditScreen(Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+s", "save", "save"),
        ("ctrl+n", "add_board", "add board"),
        ("ctrl+d", "remove_board", "remove board"),
    ]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle
        self._boards = [
            {"slug": b.slug, "name": b.name, "description": b.description, "created_at": b.created_at}
            for b in bbs.site.boards
        ]

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            ("sysop", 1),
            ("edit", 0),
        )
        with VerticalScroll(id="edit-scroll"):
            yield Static("NAME", classes="section-label")
            yield Input(value=self.bbs.site.name, id="edit-name")
            yield Static("DESCRIPTION", classes="section-label")
            yield Input(value=self.bbs.site.description, id="edit-desc")
            yield Static("INTRO", classes="section-label")
            yield TextArea(self.bbs.site.intro, id="edit-intro", language=None)
            yield Static("BOARDS (ctrl+n add, ctrl+d remove)", classes="section-label", id="boards-label")
            for b in self._boards:
                yield Static(f"  {b['slug']}", classes="subtitle", id=f"board-label-{b['slug']}")
                yield Input(value=b["name"], id=f"board-name-{b['slug']}")
                yield Input(value=b["description"], id=f"board-desc-{b['slug']}")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#edit-name", Input).focus()

    def action_add_board(self) -> None:
        # Find a unique slug
        i = len(self._boards) + 1
        while any(b["slug"] == f"board-{i}" for b in self._boards):
            i += 1
        slug = f"board-{i}"
        self._boards.append({"slug": slug, "name": slug, "description": "", "created_at": now_iso()})

        scroll = self.query_one("#edit-scroll", VerticalScroll)
        label = Static(f"  {slug}", classes="subtitle", id=f"board-label-{slug}")
        name_input = Input(value=slug, id=f"board-name-{slug}")
        desc_input = Input(value="", id=f"board-desc-{slug}")
        scroll.mount(label)
        scroll.mount(name_input)
        scroll.mount(desc_input)
        name_input.focus()

    def action_remove_board(self) -> None:
        if len(self._boards) <= 1:
            self.notify("Must have at least one board.", severity="warning")
            return

        # Remove the last board
        board = self._boards.pop()
        slug = board["slug"]
        for widget_id in (f"board-label-{slug}", f"board-name-{slug}", f"board-desc-{slug}"):
            try:
                self.query_one(f"#{widget_id}").remove()
            except Exception:
                pass

    def action_save(self) -> None:
        self._do_save()

    @work(exclusive=True)
    async def _do_save(self) -> None:
        session = require_session(self)
        if not session:
            return

        updater = make_session_updater(self.app.session_store)

        name = self.query_one("#edit-name", Input).value.strip()
        description = self.query_one("#edit-desc", Input).value.strip()
        intro = self.query_one("#edit-intro", TextArea).text

        if not name:
            self.notify("Name cannot be empty.", severity="error")
            return

        now = now_iso()

        try:
            # Update/create board records
            for b in self._boards:
                board_name = self.query_one(
                    f"#board-name-{b['slug']}", Input
                ).value.strip()
                board_desc = self.query_one(
                    f"#board-desc-{b['slug']}", Input
                ).value.strip()
                await put_board_record(
                    self.app.http_client,
                    session,
                    b["slug"],
                    board_name or b["slug"],
                    board_desc,
                    b["created_at"],
                    updater,
                )

            # Delete removed boards
            current_slugs = {b["slug"] for b in self._boards}
            for board in self.bbs.site.boards:
                if board.slug not in current_slugs:
                    await delete_record(
                        self.app.http_client, session, lexicon.BOARD, board.slug, updater
                    )

            # Update site record
            await put_site_record(
                self.app.http_client,
                session,
                {
                    "$type": lexicon.SITE,
                    "name": name,
                    "description": description,
                    "intro": intro,
                    "boards": [b["slug"] for b in self._boards],
                    "createdAt": self.bbs.site.created_at or now,
                    "updatedAt": now,
                },
                updater,
            )
            self.notify("BBS updated.")
            self.app.pop_screen()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception as e:
            self.notify(f"Could not update BBS: {e}", severity="error")


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

        # Fetch ban records
        try:
            ban_records = await list_pds_records(
                client, session["pds_url"], session["did"], lexicon.BAN
            )
            self._ban_rkeys = {
                r["value"]["did"]: AtUri.parse(r["uri"]).rkey
                for r in ban_records
                if r.get("value", {}).get("did")
            }
        except Exception:
            self._ban_rkeys = {}

        # Resolve banned handles
        banned_dids = list(self._ban_rkeys.keys())
        if banned_dids:
            try:
                authors = await resolve_identities_batch(client, banned_dids)
                banned_handles = {did: authors[did].handle for did in authors}
            except Exception:
                banned_handles = {}
        else:
            banned_handles = {}

        ban_list = self.query_one("#ban-list", ListView)
        ban_list.clear()
        for did in banned_dids:
            label = banned_handles.get(did, did)
            await ban_list.append(
                ListItem(Static(f"  {label}"), name=f"ban:{did}")
            )

        # Fetch hide records
        try:
            hide_records = await list_pds_records(
                client, session["pds_url"], session["did"], lexicon.HIDE
            )
            self._hide_rkeys = {
                r["value"]["uri"]: AtUri.parse(r["uri"]).rkey
                for r in hide_records
                if r.get("value", {}).get("uri")
            }
        except Exception:
            self._hide_rkeys = {}

        hide_list = self.query_one("#hide-list", ListView)
        hide_list.clear()
        for uri in self._hide_rkeys:
            await hide_list.append(
                ListItem(Static(f"  {uri}"), name=f"hide:{uri}")
            )

        # Focus first list with items
        if banned_dids:
            ban_list.focus()
        elif self._hide_rkeys:
            hide_list.focus()

    def action_remove(self) -> None:
        for lv_id in ("ban-list", "hide-list"):
            lv = self.query_one(f"#{lv_id}", ListView)
            if lv.index is not None and lv.has_focus:
                item = lv.children[lv.index]
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
        session = self.app.user_session
        store = self.app.session_store
        client = self.app.http_client

        async def updater(d, field, value):
            store.update_session_field(d, field, value)

        # Resolve handle to DID if needed
        did = identifier
        if not identifier.startswith("did:"):
            try:
                identity = await resolve_identity(client, identifier)
                did = identity.did
            except Exception:
                self.notify(f"Could not resolve {identifier}.", severity="error")
                return

        if did in self._ban_rkeys:
            self.notify("Already banned.", severity="warning")
            return

        try:
            await create_ban_record(client, session, did, updater)
            self.notify(f"Banned {did}.")
            self.query_one("#ban-input", Input).value = ""
            self._load_data()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception:
            self.notify("Could not ban user.", severity="error")

    def action_add_hide(self) -> None:
        uri = self.query_one("#hide-input", Input).value.strip()
        if not uri or not uri.startswith("at://"):
            self.notify("Enter a valid AT-URI.", severity="warning")
            return
        self._do_add_hide(uri)

    @work
    async def _do_add_hide(self, uri: str) -> None:
        session = self.app.user_session
        updater = make_session_updater(self.app.session_store)

        if uri in self._hide_rkeys:
            self.notify("Already hidden.", severity="warning")
            return

        try:
            await create_hidden_record(self.app.http_client, session, uri, updater)
            self.notify("Post hidden.")
            self.query_one("#hide-input", Input).value = ""
            self._load_data()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception:
            self.notify("Could not hide post.", severity="error")

    def refresh_data(self) -> None:
        self._load_data()


class SysopDeleteScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "cancel")]

    def __init__(self, bbs: BBS, handle: str) -> None:
        super().__init__()
        self.bbs = bbs
        self.handle = handle

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Static("Delete your BBS?", classes="title")
            yield Static(
                "This will delete your site record, all boards, news, "
                "bans, and hidden post records. Threads and replies from "
                "users will remain in their repos.",
            )
            yield Button("delete", id="delete-confirm", variant="error")
            yield Button("cancel", id="delete-cancel")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#delete-cancel", Button).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "delete-confirm":
            self._do_delete()
        else:
            self.app.pop_screen()

    @work(exclusive=True)
    async def _do_delete(self) -> None:
        session = self.app.user_session
        store = self.app.session_store
        client = self.app.http_client

        async def updater(d, field, value):
            store.update_session_field(d, field, value)

        failed = []

        # Delete boards
        for board in self.bbs.site.boards:
            try:
                await delete_record(
                    client, session, lexicon.BOARD, board.slug, updater
                )
            except Exception:
                failed.append(f"board/{board.slug}")

        # Delete news

        site_uri = str(AtUri(session["did"], lexicon.SITE, "self"))
        try:
            backlinks = await get_news(client, site_uri)
            for ref in backlinks.records:
                if ref.did == session["did"]:
                    try:
                        await delete_record(
                            client, session, lexicon.NEWS, ref.rkey, updater
                        )
                    except Exception:
                        failed.append(f"news/{ref.rkey}")
        except Exception:
            failed.append("news lookup")

        # Delete ban and hide records
        for collection in (lexicon.BAN, lexicon.HIDE):
            try:
                records = await list_pds_records(
                    client, session["pds_url"], session["did"], collection
                )
                for r in records:
                    rkey = AtUri.parse(r["uri"]).rkey
                    try:
                        await delete_record(
                            client, session, collection, rkey, updater
                        )
                    except Exception:
                        failed.append(f"{collection}/{rkey}")
            except Exception:
                failed.append(f"{collection} lookup")

        if failed:
            self.notify(
                f"Could not delete: {', '.join(failed)}. Site record not deleted.",
                severity="error",
            )
            return

        # Delete site record
        try:
            await delete_record(client, session, lexicon.SITE, "self", updater)
        except Exception:
            self.notify("Could not delete site record.", severity="error")
            return

        self.notify("BBS deleted.")
        # Pop delete screen + sysop screen + site screen
        self.app.pop_screen()
        self.app.pop_screen()
        self.app.pop_screen()
