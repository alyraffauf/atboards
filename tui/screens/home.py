import random

from textual import work
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Footer, Input, ListItem, ListView, Static

from tui.widgets.handle_input import HandleInput

from core import lexicon
from core.models import BBSNotFoundError, NetworkError, NoBBSError
from core.resolver import resolve_bbs
from core.slingshot import resolve_identities_batch
from tui.screens.site import SiteScreen


class HomeScreen(Screen):
    DEFAULT_CSS = """
    HomeScreen ListView {
        height: auto;
    }
    HomeScreen #discover-label {
        margin-bottom: 1;
    }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="home-container"):
            from rich.text import Text

            hero = Text()
            hero.append("▞▀▖", style="#d97706")
            hero.append("▌  ▌\n")
            hero.append("▌▙▌", style="#d97706")
            hero.append("▛▀▖▛▀▖▞▀▘\n")
            hero.append("▌▀ ", style="#d97706")
            hero.append("▌ ▌▌ ▌▝▀▖\n")
            hero.append("▝▀ ", style="#d97706")
            hero.append("▀▀ ▀▀ ▀▀")
            yield Static(hero, id="hero-title")
            yield Static(
                "Bulletin boards on the AT Protocol.", classes="subtitle", id="hero-sub1"
            )
            yield Static(
                "Build a community from your existing account. Tightly curated, fully portable, open by design.",
                classes="subtitle",
                id="hero-sub2",
            )
            yield Static("")
            yield Static("Dial a BBS", classes="title")
            yield HandleInput(id="handle-input")
            yield Static(
                "OR TRY ONE OF THESE", id="discover-label", classes="section-label"
            )
            yield ListView(id="discover-list")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#discover-label").display = False
        self.query_one("#discover-list").display = False
        self.load_discover()

    def refresh_data(self) -> None:
        lv = self.query_one("#discover-list", ListView)
        lv.clear()
        lv.display = False
        self.query_one("#discover-label").display = False
        self.load_discover()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        handle = event.value.strip()
        if handle:
            self.connect(handle)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        handle = event.item.name
        if handle:
            self.connect(handle)

    @work(exclusive=True)
    async def connect(self, handle: str) -> None:
        client = self.app.http_client
        try:
            bbs = await resolve_bbs(client, handle)
        except BBSNotFoundError:
            self.notify("BBS not found.", severity="error")
            return
        except NoBBSError:
            self.notify("This account isn't running a BBS.", severity="error")
            return
        except NetworkError:
            self.notify("Could not reach the network.", severity="error")
            return

        # Check if banned
        session = self.app.user_session
        if session and bbs.site.is_banned(session.get("did")):
            self.notify("You have been banned from this BBS.", severity="error")
            return

        self.app.push_screen(SiteScreen(bbs, handle))
        self.query_one("#handle-input", Input).value = ""

    @work
    async def load_discover(self) -> None:
        client = self.app.http_client
        try:
            resp = await client.get(
                "https://ufos-api.microcosm.blue/records",
                params={"collection": lexicon.SITE, "limit": 50},
            )
            if resp.status_code != 200:
                return
            raw = resp.json()
            if len(raw) > 5:
                raw = random.sample(raw, 5)

            dids = [record["did"] for record in raw]
            authors = await resolve_identities_batch(client, dids)

            items = []
            for record in raw:
                did = record["did"]
                if did in authors:
                    name = record["record"].get("name", "")
                    desc = record["record"].get("description", "")
                    handle = authors[did].handle
                    items.append((handle, name, desc))

            if not items:
                return

            discover_list = self.query_one("#discover-list", ListView)
            for handle, name, desc in items:
                await discover_list.append(
                    ListItem(Static(f"  {name or handle}"), name=handle)
                )

            self.query_one("#discover-label").display = True
            discover_list.display = True
            lv.index = 0  # select first bbs

        except Exception:
            pass
