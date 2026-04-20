from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Input

from core import lexicon
from core.models import AtUri, AuthError
from core.records import put_board_record, put_site_record
from core.resolver import invalidate_bbs_cache, resolve_bbs
from core.util import now_iso
from tui.screens.sysop.bbs_form import BBSFormMixin, DEFAULT_BOARD
from tui.util import make_session_updater, require_session
from tui.widgets.breadcrumb import Breadcrumb


class SysopCreateScreen(BBSFormMixin, Screen):
    BINDINGS = [
        ("escape", "app.pop_screen", "back"),
        ("ctrl+s", "save", "save"),
        ("ctrl+n", "add_board", "add board"),
        ("ctrl+d", "remove_board", "remove board"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._boards = [{**DEFAULT_BOARD, "created_at": now_iso()}]

    def compose(self) -> ComposeResult:
        yield Breadcrumb(("@bbs", 1), ("create bbs", 0))
        with VerticalScroll(id="edit-scroll"):
            yield from self.compose_site_fields()
            yield from self.compose_board_widgets()
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#edit-name", Input).focus()

    def action_save(self) -> None:
        self._do_save()

    @work(exclusive=True)
    async def _do_save(self) -> None:
        session = require_session(self)
        if not session:
            return

        updater = make_session_updater(self.app.session_store)
        name, description, intro = self.get_site_field_values()

        if not self.validate_bbs_form(name, intro):
            return

        now = now_iso()

        try:
            # Create each board record (must exist before the site record
            # because the site record references them by AT-URI).
            for board in self.get_board_values():
                await put_board_record(
                    self.app.http_client,
                    session,
                    board["slug"],
                    board["name"],
                    board["description"],
                    board["created_at"] or now,
                    updater,
                )

            # Create the site record, referencing all board AT-URIs.
            await put_site_record(
                self.app.http_client,
                session,
                {
                    "$type": lexicon.SITE,
                    "name": name,
                    "description": description,
                    "intro": intro,
                    "boards": [
                        str(AtUri(session["did"], lexicon.BOARD, board["slug"]))
                        for board in self._boards
                    ],
                    "createdAt": now,
                },
                updater,
            )
            invalidate_bbs_cache()
            self.notify("BBS created!")

            # Navigate to the new BBS so the user lands on it.
            handle = session.get("handle", "")
            self.app.pop_screen()
            bbs = await resolve_bbs(self.app.http_client, handle)

            from tui.screens.site import SiteScreen

            self.app.push_screen(SiteScreen(bbs, handle))
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception as e:
            self.notify(f"Could not create BBS: {e}", severity="error")
