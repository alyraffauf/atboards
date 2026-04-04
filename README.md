[![Build](https://github.com/alyraffauf/atboards/actions/workflows/docker.yml/badge.svg?branch=master)](https://github.com/alyraffauf/atboards/actions/workflows/docker.yml) [![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0) [![Ko-fi](https://img.shields.io/badge/Donate-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/alyraffauf)

<div align="center">
  <h1>@boards</h1>
  <h3>Bulletin boards on the atmosphere.</h3>
  <p>Run a BBS from your own account. No server required. Users own their posts, communities migrate freely. Built on <a href="https://atproto.com">atproto</a>.</p>
</div>

## Features

- **Web app and TUI**: Browse, post, and manage BBSes from your browser or terminal.
- **Built on atproto**: All data lives in user repos as `xyz.atboards` records. No central database.
- **No server needed to run a BBS**: A sysop just publishes records to their own PDS.
- **OAuth login**: Sign in with your Bluesky handle or any atproto account.
- **Discover BBSes**: The home screen shows BBSes from across the network.
- **Flat replies with quotes**: Threads with chronological replies. Quote other replies inline.
- **File attachments**: Attach files to threads and replies, stored as blobs in your repo.
- **Inbox**: See replies to your threads and quotes of your replies in one place.
- **Moderation**: Sysops can ban users, hide posts, and manage their BBS.
- **Sysop tools**: Create and edit your BBS, manage boards, post news, delete your BBS.
- **Self-hostable**: One Docker command to run the web app.

## Quick start

### TUI (recommended)

Requires Python 3.14+ and [uv](https://docs.astral.sh/uv/).

```bash
uv tool install atboards
atb
```

Or from source:

```bash
git clone https://github.com/alyraffauf/atboards.git
cd atboards
uv sync
uv run atb
```

### Web app (Docker)

```bash
docker run -d -p 8000:8000 -v atboards-data:/data -e PUBLIC_URL=https://your-domain.com ghcr.io/alyraffauf/atboards:latest
```

Or with Docker Compose:

```bash
git clone https://github.com/alyraffauf/atboards.git
cd atboards
docker compose up -d
```

Visit `http://localhost:8000`.

### Web app (from source)

```bash
git clone https://github.com/alyraffauf/atboards.git
cd atboards
uv sync
just dev
```

## Architecture

atboards has no backend database for content. All BBS data lives in atproto repos:

- **Sysop records**: `xyz.atboards.site`, `xyz.atboards.board`, `xyz.atboards.news`
- **User records**: `xyz.atboards.thread`, `xyz.atboards.reply`

The web app and TUI query existing network infrastructure:

- [Slingshot](https://slingshot.microcosm.blue/) — cached record and identity fetching
- [Constellation](https://constellation.microcosm.blue/) — backlink index for discovering threads and replies
- [UFOs](https://ufos.microcosm.blue/) — BBS discovery feed

## Configuration

On first run, atboards generates:

- `secrets.json` — app secret key and OAuth client signing key
- `atboards.db` — SQLite database for OAuth sessions

**Web app**: Set `ATBOARDS_DATA_DIR` to control where these are stored (default: current directory, `/data` in Docker). Set `PUBLIC_URL` to your domain for OAuth callbacks.

**TUI**: Data is stored in `~/.local/share/atboards/` (Linux), `~/Library/Application Support/atboards/` (macOS), or `%APPDATA%/atboards/` (Windows).

## License

[AGPL-3.0](LICENSE.md)
