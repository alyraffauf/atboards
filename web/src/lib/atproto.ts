/** Read-side wrappers for Slingshot and Constellation (no auth needed). */

import { queryClient, STALE_SLOW } from "./queryClient";
import { CDN, SERVICES } from "./shared";
import { parseAtUri } from "./util";

const SLINGSHOT = SERVICES.slingshot;
const CONSTELLATION = SERVICES.constellation;

const BSKY_PROFILE = "app.bsky.actor.profile";

// --- Types ---

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

// --- URLs ---

export function blobUrl(pds: string, did: string, cid: string): string {
  return `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
}

export function cdnImageUrl(did: string, cid: string): string {
  return `${CDN.url}/img/feed_fullsize/plain/${did}/${cid}@${CDN.image_format}`;
}

// --- Low-level JSON fetcher ---

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${url}`);
  return resp.json() as Promise<T>;
}

// --- Records ---

async function fetchRecord(
  did: string,
  collection: string,
  rkey: string,
): Promise<ATRecord> {
  return fetchJson<ATRecord>(
    `${SLINGSHOT}/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`,
  );
}

export async function getRecord(
  did: string,
  collection: string,
  rkey: string,
): Promise<ATRecord> {
  return queryClient.ensureQueryData({
    queryKey: ["record", did, collection, rkey],
    queryFn: () => fetchRecord(did, collection, rkey),
    staleTime: STALE_SLOW,
  });
}

export async function getRecordByUri(uri: string): Promise<ATRecord> {
  const { did, collection, rkey } = parseAtUri(uri);
  return getRecord(did, collection, rkey);
}

export async function getRecordsByUri(uris: string[]): Promise<ATRecord[]> {
  const results = await Promise.allSettled(uris.map(getRecordByUri));
  return results
    .filter(
      (result): result is PromiseFulfilledResult<ATRecord> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
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

// --- Identity (DID doc) ---

export async function fetchIdentityDoc(identifier: string): Promise<MiniDoc> {
  return fetchJson<MiniDoc>(
    `${SLINGSHOT}/blue.microcosm.identity.resolveMiniDoc?identifier=${encodeURIComponent(identifier)}`,
  );
}

export async function resolveIdentity(identifier: string): Promise<MiniDoc> {
  const doc = await queryClient.ensureQueryData({
    queryKey: ["identity", identifier],
    queryFn: () => fetchIdentityDoc(identifier),
    staleTime: STALE_SLOW,
  });
  // Seed the DID-keyed entry too, so later DID lookups hit cache.
  if (doc.did !== identifier) {
    queryClient.setQueryData(["identity", doc.did], doc);
  }
  return doc;
}

export async function resolveIdentitiesBatch(
  ids: string[],
): Promise<Record<string, MiniDoc>> {
  const unique = [...new Set(ids)];
  const results = await Promise.allSettled(unique.map(resolveIdentity));
  const map: Record<string, MiniDoc> = {};
  for (const result of results) {
    if (result.status === "fulfilled") map[result.value.did] = result.value;
  }
  return map;
}

// --- Avatar ---

function extractAvatarCid(value: Record<string, unknown>): string | null {
  const avatar = value.avatar as { ref?: { $link?: string } } | undefined;
  return avatar?.ref?.$link ?? null;
}

export async function fetchAvatarUrl(did: string): Promise<string | null> {
  try {
    const record = await getRecord(did, BSKY_PROFILE, "self");
    const cid = extractAvatarCid(record.value);
    return cid ? `${CDN.url}/img/avatar/plain/${did}/${cid}` : null;
  } catch {
    return null;
  }
}

export async function getAvatar(did: string): Promise<string | undefined> {
  const url = await queryClient.ensureQueryData({
    queryKey: ["avatar", did],
    queryFn: () => fetchAvatarUrl(did),
    staleTime: STALE_SLOW,
  });
  return url ?? undefined;
}

export async function getAvatars(
  dids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(dids)];
  const urls = await Promise.all(unique.map(getAvatar));
  const map: Record<string, string> = {};
  unique.forEach((did, index) => {
    const url = urls[index];
    if (url) map[did] = url;
  });
  return map;
}

// --- Backlinks (Constellation) ---

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

export async function fetchBacklinkCount(
  subject: string,
  source: string,
): Promise<number> {
  try {
    const { total } = await getBacklinks(subject, source, 1);
    return total;
  } catch {
    return 0;
  }
}

export async function getBacklinkCount(
  subject: string,
  source: string,
): Promise<number> {
  return queryClient.ensureQueryData({
    queryKey: ["backlink-count", source, subject],
    queryFn: () => fetchBacklinkCount(subject, source),
  });
}

export async function getBacklinkCountsBatch(
  subjects: string[],
  source: string,
): Promise<Record<string, number>> {
  const unique = [...new Set(subjects)];
  const counts = await Promise.all(
    unique.map((subject) => getBacklinkCount(subject, source)),
  );
  const map: Record<string, number> = {};
  unique.forEach((subject, index) => {
    map[subject] = counts[index];
  });
  return map;
}

// --- Fetch-and-hydrate (backlinks -> records -> identities) ---

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
  },
): Promise<FetchAndHydrateResult> {
  const limit = opts?.limit ?? 50;
  const backlinks = await getBacklinks(subject, source, limit, opts?.cursor);
  if (!backlinks.records.length) return { records: [], cursor: null };

  const records = await getRecordsBatch(backlinks.records);

  const filtered = records.filter((record) => {
    const { did } = parseAtUri(record.uri);
    if (opts?.excludeDid && did === opts.excludeDid) return false;
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
