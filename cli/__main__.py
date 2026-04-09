from importlib.metadata import version as pkg_version

import rich_click as click


@click.group(invoke_without_command=True)
@click.version_option(version=pkg_version("atbbs"), prog_name="atbbs")
@click.pass_context
def cli(ctx: click.Context):
    """Decentralized bulletin boards on atproto."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(dial)


@cli.command()
@click.argument("handle", required=False)
def dial(handle: str | None):
    """Dial a BBS from the terminal."""
    from tui.app import AtbbsApp

    app = AtbbsApp(dial=handle)
    app.run()


def main():
    cli()


if __name__ == "__main__":
    main()
