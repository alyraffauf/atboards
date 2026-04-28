from textual import work
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Input

from core import lexicon
from core.models import AuthError, BBS, make_at_uri
from core.records import delete_record, put_board_record, put_site_record
from core.resolver import invalidate_bbs_cache
from core.util import now_iso
from tui.screens.sysop.bbs_form import BBSFormMixin
from tui.util import make_session_updater, require_session
from tui.widgets.breadcrumb import Breadcrumb


class SysopEditScreen(BBSFormMixin, Screen):
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
            {
                "slug": board.slug,
                "name": board.name,
                "description": board.description,
                "created_at": board.created_at,
            }
            for board in bbs.site.boards
        ]

    def compose(self) -> ComposeResult:
        yield Breadcrumb(
            ("@bbs", 3),
            (self.bbs.site.name, 2),
            ("sysop", 1),
            ("edit", 0),
        )
        with VerticalScroll(id="edit-scroll"):
            yield from self.compose_site_fields(
                name=self.bbs.site.name,
                description=self.bbs.site.description,
                intro=self.bbs.site.intro,
            )
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
            # Save each board record
            for board in self.get_board_values():
                await put_board_record(
                    self.app.http_client,
                    session,
                    board["slug"],
                    board["name"],
                    board["description"],
                    board["created_at"],
                    updater,
                )

            # Delete any boards that were removed
            current_slugs = {board["slug"] for board in self._boards}
            for board in self.bbs.site.boards:
                if board.slug not in current_slugs:
                    await delete_record(
                        self.app.http_client,
                        session,
                        lexicon.BOARD,
                        board.slug,
                        updater,
                    )

            # Update the site record
            await put_site_record(
                self.app.http_client,
                session,
                {
                    "$type": lexicon.SITE,
                    "name": name,
                    "description": description,
                    "intro": intro,
                    "boards": [
                        make_at_uri(session["did"], lexicon.BOARD, board["slug"])
                        for board in self._boards
                    ],
                    "createdAt": self.bbs.site.created_at or now,
                    "updatedAt": now,
                },
                updater,
            )
            invalidate_bbs_cache()
            self.notify("BBS updated.")
            self.app.pop_screen()
        except AuthError:
            self.notify("Session expired. Please log in again.", severity="error")
        except Exception as e:
            self.notify(f"Could not update BBS: {e}", severity="error")
