"""Temporary local HTTP server to catch OAuth callbacks."""

import asyncio

from aiohttp import web


async def wait_for_callback(port: int = 23847) -> dict:
    """Start a local server and wait for the OAuth callback.

    Returns dict with 'code', 'state', and 'iss' from the callback query params.
    """
    result: dict = {}
    event = asyncio.Event()

    async def handle_callback(request: web.Request) -> web.Response:
        result["code"] = request.query.get("code", "")
        result["state"] = request.query.get("state", "")
        result["iss"] = request.query.get("iss", "")
        event.set()
        return web.Response(
            text="<html><body><p>Login complete. You can close this tab.</p></body></html>",
            content_type="text/html",
        )

    app = web.Application()
    app.router.add_get("/oauth/callback", handle_callback)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", port)
    await site.start()

    try:
        await event.wait()
    finally:
        await runner.cleanup()

    return result
