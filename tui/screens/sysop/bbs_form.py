"""Shared form logic for creating and editing a BBS.

Both the create and edit screens need the same form fields (name,
description, intro, boards) and the same board add/remove behavior.
This mixin provides all of that so neither screen has to duplicate it.
"""

from textual.containers import VerticalScroll
from textual.widgets import Input, Static, TextArea

from core import limits
from core.util import now_iso

DEFAULT_BOARD = {
    "slug": "general",
    "name": "General",
    "description": "Whatever's on your mind.",
    "created_at": "",
}


class BBSFormMixin:
    """Mixin that adds BBS form fields and board editing to a Screen.

    Subclasses must set ``self._boards`` (a list of board dicts) before
    ``compose()`` runs, and must include ``Screen`` in their MRO so that
    widget methods like ``query_one`` and ``notify`` are available.
    """

    _boards: list[dict]

    # -- Widget composition helpers ------------------------------------------

    def compose_site_fields(
        self, name: str = "", description: str = "", intro: str = ""
    ):
        """Yield the name, description, and intro form widgets."""
        yield Static("NAME", classes="section-label")
        yield Input(value=name, id="edit-name", max_length=limits.SITE_NAME)
        yield Static("DESCRIPTION", classes="section-label")
        yield Input(
            value=description, id="edit-desc", max_length=limits.SITE_DESCRIPTION
        )
        yield Static("INTRO", classes="section-label")
        yield TextArea(intro, id="edit-intro", language=None)

    def compose_board_widgets(self):
        """Yield the boards section header and a row of widgets per board."""
        yield Static(
            "BOARDS (ctrl+n add, ctrl+d remove)",
            classes="section-label",
            id="boards-label",
        )
        for board in self._boards:
            slug = board["slug"]
            yield Static(f"  {slug}", classes="subtitle", id=f"board-label-{slug}")
            yield Input(
                value=board["name"],
                id=f"board-name-{slug}",
                max_length=limits.BOARD_NAME,
            )
            yield Input(
                value=board["description"],
                id=f"board-desc-{slug}",
                max_length=limits.BOARD_DESCRIPTION,
            )

    # -- Board add / remove actions ------------------------------------------

    def action_add_board(self) -> None:
        """Add a new empty board to the form."""
        index = len(self._boards) + 1
        while any(board["slug"] == f"board-{index}" for board in self._boards):
            index += 1
        slug = f"board-{index}"
        self._boards.append(
            {"slug": slug, "name": slug, "description": "", "created_at": now_iso()}
        )

        scroll = self.query_one("#edit-scroll", VerticalScroll)
        label = Static(f"  {slug}", classes="subtitle", id=f"board-label-{slug}")
        name_input = Input(
            value=slug, id=f"board-name-{slug}", max_length=limits.BOARD_NAME
        )
        desc_input = Input(
            value="", id=f"board-desc-{slug}", max_length=limits.BOARD_DESCRIPTION
        )
        scroll.mount(label)
        scroll.mount(name_input)
        scroll.mount(desc_input)
        name_input.focus()

    def action_remove_board(self) -> None:
        """Remove the last board from the form. At least one must remain."""
        if len(self._boards) <= 1:
            self.notify("Must have at least one board.", severity="warning")
            return
        removed_board = self._boards.pop()
        slug = removed_board["slug"]
        for widget_id in (
            f"board-label-{slug}",
            f"board-name-{slug}",
            f"board-desc-{slug}",
        ):
            try:
                self.query_one(f"#{widget_id}").remove()
            except Exception:
                pass

    # -- Reading values from the form ----------------------------------------

    def get_site_field_values(self) -> tuple[str, str, str]:
        """Read the current name, description, and intro from the form.

        Returns (name, description, intro) with name and description
        stripped of leading/trailing whitespace.
        """
        name = self.query_one("#edit-name", Input).value.strip()
        description = self.query_one("#edit-desc", Input).value.strip()
        intro = self.query_one("#edit-intro", TextArea).text
        return name, description, intro

    def get_board_values(self) -> list[dict]:
        """Read the current name and description of each board from the form.

        Returns a list of dicts with keys: slug, name, description, created_at.
        If a board's name field is blank, the slug is used as the name.
        """
        boards = []
        for board in self._boards:
            slug = board["slug"]
            name = self.query_one(f"#board-name-{slug}", Input).value.strip()
            description = self.query_one(f"#board-desc-{slug}", Input).value.strip()
            boards.append(
                {
                    "slug": slug,
                    "name": name or slug,
                    "description": description,
                    "created_at": board["created_at"],
                }
            )
        return boards

    def validate_bbs_form(self, name: str, intro: str) -> bool:
        """Check that the form values are valid.

        Shows an error notification and returns False if anything is wrong.
        """
        if not name:
            self.notify("Name cannot be empty.", severity="error")
            return False
        if len(intro) > limits.SITE_INTRO:
            self.notify(
                f"Intro too long ({len(intro)}/{limits.SITE_INTRO}).",
                severity="error",
            )
            return False
        return True
