from textual import work
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Button, Footer, Static

from core import lexicon
from core.models import AtUri, BBS, make_at_uri
from core.constellation import get_root_posts
from core.records import delete_record, list_pds_records
from tui.util import make_session_updater


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
                "This will delete your site record, all boards, "
                "bans, and hidden post records. Posts from "
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
        client = self.app.http_client
        updater = make_session_updater(self.app.session_store)

        failed = []

        for board in self.bbs.site.boards:
            try:
                await delete_record(client, session, lexicon.BOARD, board.slug, updater)
            except Exception:
                failed.append(f"board/{board.slug}")

        # Delete sysop's news posts (posts scoped to site)
        site_uri = make_at_uri(session["did"], lexicon.SITE, "self")
        try:
            backlinks = await get_root_posts(client, site_uri)
            for ref in backlinks.records:
                if ref.did == session["did"]:
                    try:
                        await delete_record(
                            client, session, lexicon.POST, ref.rkey, updater
                        )
                    except Exception:
                        failed.append(f"post/{ref.rkey}")
        except Exception:
            failed.append("news lookup")

        for collection in (lexicon.BAN, lexicon.HIDE):
            try:
                records = await list_pds_records(
                    client, session["pds_url"], session["did"], collection
                )
                for record in records:
                    rkey = AtUri.parse(record["uri"]).rkey
                    try:
                        await delete_record(client, session, collection, rkey, updater)
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

        try:
            await delete_record(client, session, lexicon.SITE, "self", updater)
        except Exception:
            self.notify("Could not delete site record.", severity="error")
            return

        self.notify("BBS deleted.")
        self.app.pop_screen()
        self.app.pop_screen()
        self.app.pop_screen()
