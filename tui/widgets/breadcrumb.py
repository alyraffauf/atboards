from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Static


class BreadcrumbLink(Static, can_focus=True):
    """A clickable breadcrumb segment."""

    DEFAULT_CSS = """
    BreadcrumbLink {
        color: #8a8a8a;
        width: auto;
    }
    BreadcrumbLink:hover {
        color: #a3a3a3;
    }
    BreadcrumbLink:focus {
        color: #e5e5e5;
    }
    """

    def __init__(self, label: str, pop_count: int, **kwargs) -> None:
        if label == "@bbs":
            display = " [#d97706]@[/]bbs "
            super().__init__(display, markup=True, **kwargs)
        else:
            super().__init__(f" {label} ", markup=False, **kwargs)
        self.pop_count = pop_count

    def on_click(self) -> None:
        for _ in range(self.pop_count):
            self.app.pop_screen()

    def key_enter(self) -> None:
        self.on_click()


class BreadcrumbSep(Static):
    DEFAULT_CSS = """
    BreadcrumbSep {
        color: #525252;
        width: auto;
    }
    """

    def __init__(self) -> None:
        super().__init__(" / ")


class Breadcrumb(Widget):
    """A breadcrumb bar with clickable segments."""

    DEFAULT_CSS = """
    Breadcrumb {
        dock: top;
        height: auto;
        min-height: 1;
        background: #262626;
        layout: horizontal;
    }
    Breadcrumb .breadcrumb-user {
        dock: right;
        width: auto;
        color: #8a8a8a;
    }
    """

    def __init__(self, *segments: tuple[str, int]) -> None:
        """Each segment is (label, pop_count). pop_count=0 means current page (not clickable)."""
        super().__init__()
        self._segments = segments

    def compose(self) -> ComposeResult:
        # Show logged-in user on the right
        session = getattr(self.app, "user_session", None)
        if session:
            yield Static(f" {session['handle']} ", classes="breadcrumb-user", markup=False)

        for i, (label, pop_count) in enumerate(self._segments):
            if i > 0:
                yield BreadcrumbSep()
            if pop_count > 0:
                yield BreadcrumbLink(label, pop_count)
            else:
                yield Static(f" {label} ", classes="breadcrumb-current", markup=False)
