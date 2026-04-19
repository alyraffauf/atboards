<div align="center">
  <p>
    <a href="https://github.com/alyraffauf/atbbs/actions/workflows/docker.yml"><img src="https://github.com/alyraffauf/atbbs/actions/workflows/docker.yml/badge.svg?branch=master" alt="Build"></a>
    <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3"></a>
    <a href="https://ko-fi.com/alyraffauf"><img src="https://img.shields.io/badge/Donate-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white" alt="Ko-fi"></a>
  </p>
  <img width="128" height="128" src="assets/logo.svg" alt="@bbs logo">
  <h1>@bbs</h1>
  <h3>Build a community from your existing account.</h3>
  <h3>Tightly curated, fully portable, open by design.</h3>
  <h3>Built on <a href="https://atproto.com">atproto</a>.</h3>
  <img src="assets/screenshot.png" alt="@bbs screenshot" width="800">
</div>

## Features

- **Web and terminal**: Use it in your browser, dial in from a TUI, or connect via <a href="telnet://tel.atbbs.xyz">telnet</a>.
- **Serverless**: Run a BBS straight from your atproto account. No hosting required.
- **Replies and quotes**: Flat threads with inline quoting.
- **Attachments**: Upload files to threads and replies.
- **Messages**: Know when someone replies to your thread or quotes you.
- **Moderation**: Ban users, hide posts, manage your boards.
- **Discovery**: Browse BBSes from across the network.

## Install

Requires Python 3.14+.

### uv

```bash
uv tool install atbbs
```

### Homebrew

```bash
brew install alyraffauf/tap/atbbs
```

## Usage

```bash
atbbs                  # launch TUI
atbbs dial aly.codes   # dial a BBS directly
atbbs --help           # see all options
```

## Web app

### Docker

```bash
docker run -d -p 8080:80 -e PUBLIC_URL=https://your-domain.com ghcr.io/alyraffauf/atbbs:latest
```

Or with Docker Compose:

```bash
git clone https://github.com/alyraffauf/atbbs.git
cd atbbs
PUBLIC_URL=https://your-domain.com docker compose up -d
```

### From source

Requires [Node.js](https://nodejs.org/) and [just](https://just.systems/).

```bash
git clone https://github.com/alyraffauf/atbbs.git
cd atbbs
cd web && npm install && cd ..
uv sync
just dev     # run dev server with hot reload
just fmt     # format code
just build   # build for static deploy (set PUBLIC_URL)
just docker  # build docker image
```

## Architecture

atbbs has no backend database for content. All BBS data lives in atproto repos:

- **Sysop records**: `xyz.atbbs.site`, `xyz.atbbs.board`
- **Moderation records**: `xyz.atbbs.ban`, `xyz.atbbs.hide`
- **User records**: `xyz.atbbs.post`, `xyz.atbbs.pin`, `xyz.atbbs.profile`

The web app and TUI query existing network infrastructure:

- [Slingshot](https://slingshot.microcosm.blue/) — cached record and identity fetching
- [Constellation](https://constellation.microcosm.blue/) — backlink index for discovering threads and replies
- [Lightrail](https://lightrail.microcosm.blue/) — BBS discovery via collection listing

## Configuration

On first run, atbbs generates:

- `secrets.json` — app secret key and OAuth client signing key
- `atbbs.db` — SQLite database for OAuth sessions

**Web app (Docker)**: Set `PUBLIC_URL` to your domain for OAuth callbacks (required).

**TUI**: Data is stored in `~/.local/share/atbbs/` (Linux), `~/Library/Application Support/atbbs/` (macOS), or `%APPDATA%/atbbs/` (Windows).

## License

[AGPL-3.0](LICENSE.md)
