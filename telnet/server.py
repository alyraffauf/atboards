import asyncio

import httpx

import re
import textwrap

from core.records import hydrate_replies, hydrate_threads
from core.resolver import resolve_bbs
from core.util import format_datetime_utc

AMBER = "\033[38;5;208m"
RESET = "\033[0m"
DIM = "\033[2m"

LOGO = (
    f"  {AMBER}▞▀▖{RESET}▌  ▌\r\n"
    f"  {AMBER}▌▙▌{RESET}▛▀▖▛▀▖▞▀▘\r\n"
    f"  {AMBER}▌▀ {RESET}▌ ▌▌ ▌▝▀▖\r\n"
    f"  {AMBER}▝▀ {RESET}▀▀ ▀▀ ▀▀\r\n"
)


LINE_WIDTH = 75

READ_TIMEOUT = 120  # seconds per prompt
MAX_CONNECTIONS = 20

_connections = asyncio.Semaphore(MAX_CONNECTIONS)


def wrap(text: str) -> str:
    """Wrap text to LINE_WIDTH without breaking indentation."""
    out = []
    for line in text.split("\r\n"):
        visible = re.sub(r"\033\[[0-9;]*m", "", line)  # Strip ANSI codes
        if len(visible) <= LINE_WIDTH:
            out.append(line)
        else:
            indent = len(visible) - len(visible.lstrip())  # Preserve indentation
            wrapped = textwrap.fill(
                visible,
                width=LINE_WIDTH,
                initial_indent="",
                subsequent_indent=" " * indent,
            )
            out.append(wrapped)
    return "\r\n".join(out)


def strip_iac(data: bytes) -> bytes:
    """Strip telnet IAC command sequences from raw bytes."""
    out = bytearray()
    i = 0
    while i < len(data):
        if data[i] == 0xFF and i + 1 < len(data):
            cmd = data[i + 1]
            if cmd == 0xFF:
                out.append(0xFF)
                i += 2
            elif cmd in (0xFB, 0xFC, 0xFD, 0xFE):
                i += 3  # WILL/WONT/DO/DONT + option
            elif cmd == 0xFA:
                i += 2  # sub-negotiation: skip until IAC SE
                while i < len(data):
                    if data[i] == 0xFF and i + 1 < len(data) and data[i + 1] == 0xF0:
                        i += 2
                        break
                    i += 1
            else:
                i += 2
        else:
            out.append(data[i])
            i += 1
    return bytes(out)


async def write(writer: asyncio.StreamWriter, text: str):
    writer.write(wrap(text).encode())
    await writer.drain()


async def prompt(
    reader: asyncio.streamReader, writer: asyncio.StreamWriter, label: str = "> "
) -> str:
    """Handle prompt + inactivity timeouts safely."""
    await write(writer, label)
    try:
        data = await asyncio.wait_for(reader.readline(), timeout=READ_TIMEOUT)
    except asyncio.TimeoutError:
        await write(writer, "\r\n  Connection inactive.\r\n")
        return ""
    if not data:
        return ""
    text = strip_iac(data).decode(errors="ignore").strip()
    return re.sub(r"[^\x20-\x7e]", "", text)


async def show_bbs(writer, bbs):
    await write(writer, f"\r\n  {bbs.site.name}\r\n")
    await write(writer, f"  {bbs.site.description}\r\n")
    if bbs.site.intro:
        await write(writer, "\r\n")
        for line in bbs.site.intro.splitlines():
            await write(writer, f"    {line}\r\n")
    await write(writer, "\r\n")
    if bbs.site.boards:
        await write(writer, "  Boards\r\n")
        for i, board in enumerate(bbs.site.boards, 1):
            await write(writer, f"    {i}. {board.name}: {board.description}\r\n")
        await write(writer, "\r\n")

    if bbs.news:
        await write(writer, f"  Latest News: {bbs.news[0].title}\r\n\r\n")

    await write(writer, "[#] open board  [n] news  [q] quit\r\n")


async def show_board(writer, board, threads, has_next):
    await write(writer, f"\r\n  {board.name}\r\n")
    await write(writer, f"  {board.description}\r\n\r\n")

    if not threads:
        await write(writer, "  No threads yet.\r\n")
    else:
        for i, t in enumerate(threads, 1):
            date = format_datetime_utc(t.created_at)
            await write(
                writer, f"  {i}. {t.title}  ·  {t.author.handle}  ·  {date}\r\n"
            )

    cmds = ["[#] open thread"]
    if has_next:
        cmds.append("[n] next")
    cmds.extend(["[b] back", "[q] quit"])
    await write(writer, f"\r\n{'  '.join(cmds)}\r\n")


async def show_thread_header(writer, thread):
    await write(writer, f"\r\n  {thread.title}\r\n")
    await write(
        writer,
        f"  by {thread.author.handle}  ·  {format_datetime_utc(thread.created_at)}\r\n",
    )
    await write(writer, "\r\n")
    for line in thread.body.splitlines():
        await write(writer, f"    {line}\r\n")
    await write(writer, "\r\n")


async def show_replies(writer, replies):
    for r in replies:
        await write(
            writer, f"  {r.author.handle}  ·  {format_datetime_utc(r.created_at)}\r\n"
        )
        for line in r.body.splitlines():
            await write(writer, f"    {line}\r\n")
        await write(writer, "\r\n")


async def show_thread_prompt(writer, has_more):
    cmds = ["[b] back"]
    if has_more:
        cmds.append("[n] show more")
    cmds.append("[q] quit")
    await write(writer, f"{'  '.join(cmds)}\r\n")


async def show_news(writer, news):
    await write(writer, "\r\n  News:\r\n\r\n")
    for item in news:
        await write(
            writer, f"  {item.title}  ·  {format_datetime_utc(item.created_at)}\r\n"
        )
        for line in item.body.splitlines():
            await write(writer, f"    {line}\r\n")
        await write(writer, "\r\n")
    await write(writer, "[b] back  [q] quit\r\n")


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    if _connections.locked():
        writer.write(b"  Server is full. Try again later.\r\n")
        await writer.drain()
        writer.close()
        return
    async with _connections, httpx.AsyncClient() as client:
        await write(writer, f"\r\n{LOGO}\r\n")
        await write(
            writer,
            "  This is a read-only telnet gateway for Atmosphere BBSes.\r\n  Please dial a BBS.\r\n\r\n",
        )

        handle = await prompt(reader, writer, "handle> ")
        if not handle:
            writer.close()
            return

        try:
            bbs = await resolve_bbs(client, handle)
        except Exception as e:
            await write(writer, "  Could not reach that BBS.\r\n")
            await write(writer, f"{e}\r\n")
            writer.close()
            return

        state = "bbs"
        board = None
        threads = []
        thread_cursor = None
        thread = None
        reply_result = None

        while True:
            if state == "bbs":
                await show_bbs(writer, bbs)
            elif state == "board":
                await show_board(writer, board, threads, thread_cursor is not None)
            elif state == "news":
                await show_news(writer, bbs.news)

            # Thread state renders inline below — prompt only
            if state == "thread":
                await show_thread_prompt(
                    writer, reply_result.page < reply_result.total_pages
                )

            cmd = await prompt(reader, writer)
            if not cmd or cmd == "q":
                break

            if state == "bbs":
                if cmd == "n" and bbs.news:
                    state = "news"
                elif cmd.isdigit():
                    idx = int(cmd) - 1
                    if 0 <= idx < len(bbs.site.boards):
                        board = bbs.site.boards[idx]
                        try:
                            threads, thread_cursor = await hydrate_threads(
                                client, bbs, board
                            )
                        except Exception:
                            await write(writer, "  Could not load threads.\r\n")
                            continue
                        state = "board"

            elif state == "board":
                if cmd == "b":
                    state = "bbs"
                elif cmd == "n" and thread_cursor:
                    try:
                        threads, thread_cursor = await hydrate_threads(
                            client, bbs, board, cursor=thread_cursor
                        )
                    except Exception:
                        await write(writer, "  Could not load threads.\r\n")
                elif cmd.isdigit():
                    idx = int(cmd) - 1
                    if 0 <= idx < len(threads):
                        thread = threads[idx]
                        await show_thread_header(writer, thread)
                        try:
                            reply_result = await hydrate_replies(
                                client, bbs, thread.uri
                            )
                        except Exception:
                            await write(writer, "  Could not load replies.\r\n")
                            continue
                        await show_replies(writer, reply_result.replies)
                        state = "thread"

            elif state == "thread":
                if cmd == "b":
                    state = "board"
                elif cmd == "n" and reply_result.page < reply_result.total_pages:
                    try:
                        reply_result = await hydrate_replies(
                            client, bbs, thread.uri, page=reply_result.page + 1
                        )
                        await show_replies(writer, reply_result.replies)
                    except Exception:
                        await write(writer, "  Could not load replies.\r\n")

            elif state == "news":
                if cmd == "b":
                    state = "bbs"

        await write(writer, "\r\n  Goodbye!\r\n")
        writer.close()


async def main(host: str = "0.0.0.0", port: int = 2323):
    server = await asyncio.start_server(handle_client, host, port, limit=256)
    print(f"Telnet BBS gateway listening on {host}:{port}")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
