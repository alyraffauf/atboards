"""CLI entry point for the web server."""

import sys

from web.app import create_app


def main():
    app = create_app()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
