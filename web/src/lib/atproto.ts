/** Read-side wrappers for Slingshot and Constellation (no auth needed). */

import { parseAtUri } from "./util";

const SLINGSHOT = "https://slingshot.microcosm.blue/xrpc";
const CONSTELLATION = "https://constellation.microcosm.blue/xrpc";

export interface MiniDoc {
  did: string;
  handle: string;
  pds?: string;
}

export interface BacklinkRef {
  did: string;
  collection: string;
  rkey: string;
}

interface BacklinksResponse {
  total: number;
  records: BacklinkRef[];
  cursor?: string;
}

export interface ATRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

interface ListRecordsResponse {
  records: { uri: string; cid: string; value: Record<string, unknown> }[];
  cursor?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${url}`);
  return resp.json() as Promise<T>;
}

export async function resolveIdentity(identifier: string): Promise<MiniDoc> {
  return fetchJson<MiniDoc>(
    `${SLINGSHOT}/blue.microcosm.identity.resolveMiniDoc?identifier=${encodeURIComponent(identifier)}`,
  );
}

export async function resolveIdentitiesBatch(
  dids: string[],
): Promise<Record<string, MiniDoc>> {
  const unique = [...new Set(dids)];
  const results = await Promise.allSettled(unique.map(resolveIdentity));
  const map: Record<string, MiniDoc> = {};
  for (const r of results) {
    if (r.status === "fulfilled") map[r.value.did] = r.value;
  }
  return map;
}

export async function getRecord(
  did: string,
  collection: string,
  rkey: string,
): Promise<ATRecord> {
  return fetchJson<ATRecord>(
    `${SLINGSHOT}/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`,
  );
}

export async function getRecordByUri(uri: string): Promise<ATRecord> {
  const { did, collection, rkey } = parseAtUri(uri);
  return getRecord(did, collection, rkey);
}

export async function getRecordsBatch(
  refs: BacklinkRef[],
): Promise<ATRecord[]> {
  const results = await Promise.allSettled(
    refs.map((r) => getRecord(r.did, r.collection, r.rkey)),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<ATRecord> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

export async function getBacklinks(
  subject: string,
  source: string,
  limit = 50,
  cursor?: string,
): Promise<BacklinksResponse> {
  let url = `${CONSTELLATION}/blue.microcosm.links.getBacklinks?subject=${encodeURIComponent(subject)}&source=${encodeURIComponent(source)}&limit=${limit}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  return fetchJson<BacklinksResponse>(url);
}

interface HydratedRecord {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  pds: string;
  value: Record<string, unknown>;
}

interface FetchAndHydrateResult {
  records: HydratedRecord[];
  cursor: string | null;
}

export async function fetchAndHydrate(
  subject: string,
  source: string,
  opts?: {
    limit?: number;
    cursor?: string;
    excludeDid?: string;
    bannedDids?: Set<string>;
    hiddenPosts?: Set<string>;
  },
): Promise<FetchAndHydrateResult> {
  const limit = opts?.limit ?? 50;
  const backlinks = await getBacklinks(subject, source, limit, opts?.cursor);
  if (!backlinks.records.length) return { records: [], cursor: null };

  const records = await getRecordsBatch(backlinks.records);

  const filtered = records.filter((r) => {
    const { did } = parseAtUri(r.uri);
    if (opts?.excludeDid && did === opts.excludeDid) return false;
    if (opts?.bannedDids?.has(did)) return false;
    if (opts?.hiddenPosts?.has(r.uri)) return false;
    return true;
  });

  if (!filtered.length)
    return { records: [], cursor: backlinks.cursor ?? null };

  const dids = filtered.map((r) => parseAtUri(r.uri).did);
  const authors = await resolveIdentitiesBatch(dids);

  const hydrated = filtered
    .filter((r) => parseAtUri(r.uri).did in authors)
    .map((r) => {
      const parsed = parseAtUri(r.uri);
      const author = authors[parsed.did];
      return {
        uri: r.uri,
        did: parsed.did,
        rkey: parsed.rkey,
        handle: author.handle,
        pds: author.pds ?? "",
        value: r.value,
      };
    });

  return { records: hydrated, cursor: backlinks.cursor ?? null };
}

export async function listRecords(
  pdsUrl: string,
  did: string,
  collection: string,
  limit = 100,
): Promise<{ uri: string; cid: string; value: Record<string, unknown> }[]> {
  const all: ListRecordsResponse["records"] = [];
  let cursor: string | undefined;
  while (true) {
    let url = `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&limit=${limit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    try {
      const data = await fetchJson<ListRecordsResponse>(url);
      all.push(...data.records);
      if (!data.cursor) break;
      cursor = data.cursor;
    } catch {
      break;
    }
  }
  return all;
}
