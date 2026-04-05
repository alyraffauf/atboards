import os

import httpx
from platformdirs import user_data_dir
from textual.app import App, ComposeResult
from textual.binding import Binding

from core.auth.session import SessionStore
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import Button, Footer, Static

from tui.screens.home import HomeScreen


class LogoutConfirmScreen(Screen):
    BINDINGS = [("escape", "app.pop_screen", "cancel")]

    BINDINGS = [("escape", "app.pop_screen", "cancel")]

    DEFAULT_CSS = """
    LogoutConfirmScreen {
        align: center middle;
    }
    LogoutConfirmScreen Vertical {
        width: 40;
        height: auto;
        padding: 1 2;
    }
    LogoutConfirmScreen Button {
        width: 100%;
        margin-top: 1;
    }
    """

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Static("Log out?", classes="title")
            yield Button("log out", id="logout-confirm", variant="error")
            yield Button("cancel", id="logout-cancel")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#logout-confirm", Button).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "logout-confirm":
            self.app.pop_screen()
            self.app.do_logout()
        else:
            self.app.pop_screen()


DATA_DIR = os.environ.get("ATBBS_DATA_DIR", user_data_dir("atbbs"))


class AtbbsApp(App):
    TITLE = "@bbs"
    CSS_PATH = "app.tcss"
    BINDINGS = [
        Binding("ctrl+q", "quit", "quit"),
        Binding("ctrl+l", "login", "account"),
        Binding("ctrl+r", "refresh", "refresh", show=False),
        Binding("ctrl+t", "inbox", "messages", show=False),
    ]
    SCREENS = {"home": HomeScreen}

    def __init__(self, dial: str | None = None):
        super().__init__()
        self._dial = dial

    def on_mount(self) -> None:
        self.http_client = httpx.AsyncClient()
        os.makedirs(DATA_DIR, exist_ok=True)
        db_path = os.path.join(DATA_DIR, "atbbs.db")
        self.session_store = SessionStore(db_path)
        self.user_session = None

        # Restore saved session
        self._restore_session()

        home = HomeScreen()
        self.push_screen(home)

        if self._dial:
            home.connect(self._dial)

    def _restore_session(self) -> None:
        """Load the most recent session from the database."""
        import sqlite3

        try:
            con = sqlite3.connect(self.session_store.db_path)
            con.row_factory = sqlite3.Row
            row = con.execute("SELECT * FROM oauth_session LIMIT 1").fetchone()
            con.close()
            if row:
                self.user_session = dict(row)
                self.sub_title = self.user_session.get("handle", "")
        except Exception:
            pass

    def action_login(self) -> None:
        if self.user_session:
            self.push_screen(LogoutConfirmScreen())
        else:
            from tui.screens.login import LoginScreen

            self.push_screen(LoginScreen())

    def do_logout(self) -> None:
        did = self.user_session.get("did")
        if did:
            self.session_store.delete_session(did)
        handle = self.user_session.get("handle", "")
        self.user_session = None
        self.sub_title = ""
        self.notify(f"Logged out of {handle}.")

    def action_inbox(self) -> None:
        if not self.user_session:
            self.notify("Log in to see your messages.", severity="warning")
            return
        from tui.screens.activity import ActivityScreen

        self.push_screen(ActivityScreen())

    def watch_screen(self) -> None:
        """Update title when returning from login."""
        if self.user_session:
            self.sub_title = self.user_session.get("handle", "")

    def action_refresh(self) -> None:
        screen = self.screen
        if hasattr(screen, "refresh_data"):
            screen.refresh_data()

    async def on_unmount(self) -> None:
        if hasattr(self, "http_client"):
            await self.http_client.aclose()
