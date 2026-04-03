import asyncio

import httpx

from core.models import BacklinkRef, MiniDoc, Record

BASE_URL = "https://slingshot.microcosm.blue/xrpc"


async def get_record(
    client: httpx.AsyncClient, repo: str, collection: str, rkey: str
) -> Record:
    """Fetch a single record by repo/collection/rkey."""
    resp = await client.get(
        f"{BASE_URL}/com.atproto.repo.getRecord",
        params={"repo": repo, "collection": collection, "rkey": rkey},
    )
    resp.raise_for_status()
    data = resp.json()
    return Record(uri=data["uri"], cid=data["cid"], value=data["value"])


async def get_record_by_uri(client: httpx.AsyncClient, at_uri: str) -> Record:
    """Fetch a single record by AT-URI."""
    resp = await client.get(
        f"{BASE_URL}/blue.microcosm.repo.getRecordByUri",
        params={"uri": at_uri},
    )
    resp.raise_for_status()
    data = resp.json()
    return Record(uri=data["uri"], cid=data["cid"], value=data["value"])


async def resolve_identity(client: httpx.AsyncClient, identifier: str) -> MiniDoc:
    """Resolve a handle or DID to a MiniDoc."""
    resp = await client.get(
        f"{BASE_URL}/blue.microcosm.identity.resolveMiniDoc",
        params={"identifier": identifier},
    )
    resp.raise_for_status()
    data = resp.json()
    return MiniDoc(
        did=data["did"],
        handle=data["handle"],
        pds=data.get("pds"),
        signing_key=data.get("signing_key"),
    )


async def resolve_identities_batch(
    client: httpx.AsyncClient, dids: list[str]
) -> dict[str, MiniDoc]:
    """Resolve multiple DIDs concurrently, skipping failures."""
    tasks = [resolve_identity(client, did) for did in dids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {
        r.did: r for r in results if isinstance(r, MiniDoc)
    }


async def get_records_batch(
    client: httpx.AsyncClient, refs: list[BacklinkRef]
) -> list[Record]:
    """Fetch multiple records concurrently, skipping failures."""
    tasks = [
        get_record(client, ref.did, ref.collection, ref.rkey) for ref in refs
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, Record)]
