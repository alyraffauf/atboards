/** Read-side wrappers for Slingshot and Constellation (no auth needed). */

import { TTLCache } from "./cache";
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

const identityCache = new TTLCache<string, MiniDoc>(5 * 60 * 1000);

export async function resolveIdentity(identifier: string): Promise<MiniDoc> {
  const cached = identityCache.get(identifier);
  if (cached) return cached;

  const doc = await fetchJson<MiniDoc>(
    `${SLINGSHOT}/blue.microcosm.identity.resolveMiniDoc?identifier=${encodeURIComponent(identifier)}`,
  );
  identityCache.set(identifier, doc);
  identityCache.set(doc.did, doc);
  return doc;
}

export async function resolveIdentitiesBatch(
  dids: string[],
): Promise<Record<string, MiniDoc>> {
  const unique = [...new Set(dids)];
  const results = await Promise.allSettled(unique.map(resolveIdentity));
  const map: Record<string, MiniDoc> = {};
  for (const result of results) {
    if (result.status === "fulfilled") map[result.value.did] = result.value;
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
    refs.map((ref) => getRecord(ref.did, ref.collection, ref.rkey)),
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<ATRecord> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
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

  const filtered = records.filter((record) => {
    const { did } = parseAtUri(record.uri);
    if (opts?.excludeDid && did === opts.excludeDid) return false;
    if (opts?.bannedDids?.has(did)) return false;
    if (opts?.hiddenPosts?.has(record.uri)) return false;
    return true;
  });

  if (!filtered.length)
    return { records: [], cursor: backlinks.cursor ?? null };

  const dids = filtered.map((record) => parseAtUri(record.uri).did);
  const authors = await resolveIdentitiesBatch(dids);

  const hydrated = filtered
    .filter((record) => parseAtUri(record.uri).did in authors)
    .map((record) => {
      const { did, rkey } = parseAtUri(record.uri);
      const author = authors[did];
      return {
        uri: record.uri,
        did,
        rkey,
        handle: author.handle,
        pds: author.pds ?? "",
        value: record.value,
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
