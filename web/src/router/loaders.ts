/** Route loaders. Pages read these via useLoaderData(). */

import { redirect, type LoaderFunctionArgs } from "react-router-dom";
import { ensureAuthReady, getCurrentUser } from "../lib/auth";
import { resolveBBS, type BBS } from "../lib/bbs";
import { fetchInbox } from "../lib/inbox";
import {
  getRecord,
  getRecordByUri,
  getBacklinks,
  getRecordsBatch,
  listRecords,
  resolveIdentitiesBatch,
  resolveIdentity,
  type ATRecord,
  type BacklinkRef,
} from "../lib/atproto";
import { SITE, THREAD, REPLY, BAN, HIDE, BOARD } from "../lib/lexicon";
import { makeAtUri, parseAtUri } from "../lib/util";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as threadSchema } from "../lexicons/types/xyz/atboards/thread";
import { mainSchema as banSchema } from "../lexicons/types/xyz/atboards/ban";
import { mainSchema as hideSchema } from "../lexicons/types/xyz/atboards/hide";
import type {
  XyzAtboardsThread,
  XyzAtboardsBan,
  XyzAtboardsHide,
} from "../lexicons";

// --- Auth guard (shared by all protected loaders) ---

async function requireAuth() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/login");
  return user;
}

// --- BBS parent ---

export async function bbsLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const bbs = await resolveBBS(handle);
  return { handle, bbs };
}

export type BBSLoaderData = { handle: string; bbs: BBS };

// --- Board ---

export interface ThreadItem {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  title: string;
  body: string;
  createdAt: string;
}

/** Fetch one page of threads for a board, hydrated and filtered. */
export async function hydrateThreadPage(
  bbs: BBS,
  slug: string,
  cursor?: string,
): Promise<{ threads: ThreadItem[]; cursor: string | null }> {
  const boardUri = makeAtUri(bbs.identity.did, BOARD, slug);
  const backlinks = await getBacklinks(boardUri, `${THREAD}:board`, 50, cursor);
  const records = await getRecordsBatch(backlinks.records);
  const filtered = records.filter((r) => {
    const { did } = parseAtUri(r.uri);
    return (
      !bbs.site.bannedDids.has(did) &&
      !bbs.site.hiddenPosts.has(r.uri) &&
      is(threadSchema, r.value)
    );
  });
  const authors = await resolveIdentitiesBatch(
    filtered.map((r) => parseAtUri(r.uri).did),
  );
  const threads: ThreadItem[] = filtered
    .filter((r) => parseAtUri(r.uri).did in authors)
    .map((r: ATRecord) => {
      const { did, rkey } = parseAtUri(r.uri);
      const v = r.value as unknown as XyzAtboardsThread.Main;
      return {
        uri: r.uri,
        did,
        rkey,
        handle: authors[did].handle,
        title: v.title,
        body: v.body,
        createdAt: v.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { threads, cursor: backlinks.cursor ?? null };
}

export async function boardLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const slug = params.slug!;
  const bbs = await resolveBBS(handle);
  const board = bbs.site.boards.find((b) => b.slug === slug);
  if (!board) throw new Response("Board not found", { status: 404 });

  const { threads, cursor } = await hydrateThreadPage(bbs, slug);
  return { handle, bbs, board, threads, cursor };
}

// --- Thread ---

export interface ThreadObj {
  uri: string;
  did: string;
  rkey: string;
  authorHandle: string;
  authorPds: string;
  title: string;
  body: string;
  createdAt: string;
  boardSlug: string;
  attachments?: { file: { ref: { $link: string } }; name: string }[];
}

export async function threadLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const did = params.did!;
  const tid = params.tid!;

  const threadUri = makeAtUri(did, THREAD, tid);
  const [bbs, tr, author, allRefs] = await Promise.all([
    resolveBBS(handle),
    getRecord(did, THREAD, tid),
    resolveIdentity(did),
    collectAllReplyRefs(threadUri),
  ]);
  if (!is(threadSchema, tr.value)) {
    throw new Response("Invalid thread record", { status: 404 });
  }
  const tv = tr.value as unknown as XyzAtboardsThread.Main;
  const boardSlug = parseAtUri(tv.board).rkey;
  const thread: ThreadObj = {
    uri: tr.uri,
    did,
    rkey: tid,
    authorHandle: author.handle,
    authorPds: author.pds ?? "",
    title: tv.title,
    body: tv.body,
    createdAt: tv.createdAt,
    boardSlug,
    attachments: tv.attachments as ThreadObj["attachments"],
  };

  return { handle, bbs, thread, allRefs };
}

// --- Account ---

export type { InboxItem } from "../lib/inbox";

/** Collect all reply refs, paginating Constellation in chunks of 100. */
async function collectAllReplyRefs(threadUri: string): Promise<BacklinkRef[]> {
  const collected: BacklinkRef[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await getBacklinks(threadUri, `${REPLY}:subject`, 100, cursor);
    collected.push(...page.records);
    if (!page.cursor) break;
    cursor = page.cursor;
  }
  return collected.reverse(); // oldest first
}

export async function accountLoader() {
  const user = await requireAuth();

  // Probe site record (fast — keep awaited so the page can render with it)
  let hasBBS = false;
  let bbsName: string | null = null;
  try {
    const r = await getRecord(user.did, SITE, "self");
    hasBBS = true;
    const sv = r.value as unknown as { name?: string };
    bbsName = sv.name ?? user.handle;
  } catch {
    // no site
  }

  // Inbox lookup is slow — return the promise unawaited so the page renders
  // immediately and items stream in via <Await>. (v7 auto-defers promises.)
  const itemsPromise = fetchInbox(user.did, user.pdsUrl);
  return { user, hasBBS, bbsName, items: itemsPromise };
}

// --- Sysop ---

export async function requireAuthLoader() {
  return { user: await requireAuth() };
}

export async function sysopEditLoader() {
  const user = await requireAuth();
  try {
    const bbs = await resolveBBS(user.handle);
    return { user, bbs };
  } catch {
    throw redirect("/account/create");
  }
}

export interface HiddenInfo {
  uri: string;
  handle: string;
  title: string;
  body: string;
}

/** Build a map from a record field value to its rkey, for deletion. */
function buildRkeyMap<T>(
  records: { uri: string; value: Record<string, unknown> }[],
  schema: Parameters<typeof is>[0],
  getKey: (v: T) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of records) {
    if (!is(schema, r.value)) continue;
    map[getKey(r.value as unknown as T)] = parseAtUri(r.uri).rkey;
  }
  return map;
}

async function hydrateHiddenPosts(uris: Set<string>): Promise<HiddenInfo[]> {
  const hidden: HiddenInfo[] = [];
  for (const uri of uris) {
    const did = parseAtUri(uri).did;
    let handle = did;
    try {
      handle = (await resolveIdentity(did)).handle;
    } catch {}
    try {
      const rec = await getRecordByUri(uri);
      const v = rec.value as unknown as { title?: string; body?: string };
      hidden.push({
        uri,
        handle,
        title: v.title ?? "",
        body: (v.body ?? "").substring(0, 100),
      });
    } catch {
      hidden.push({ uri, handle, title: "", body: uri });
    }
  }
  return hidden;
}

export async function sysopModerateLoader() {
  const user = await requireAuth();

  let bbs: BBS;
  try {
    bbs = await resolveBBS(user.handle);
  } catch {
    throw redirect("/account/create");
  }

  const [banRecs, hideRecs] = await Promise.all([
    listRecords(user.pdsUrl, user.did, BAN),
    listRecords(user.pdsUrl, user.did, HIDE),
  ]);

  const banRkeys = buildRkeyMap<XyzAtboardsBan.Main>(
    banRecs,
    banSchema,
    (v) => v.did,
  );
  const hideRkeys = buildRkeyMap<XyzAtboardsHide.Main>(
    hideRecs,
    hideSchema,
    (v) => v.uri,
  );

  let bannedHandles: Record<string, string> = {};
  if (bbs.site.bannedDids.size) {
    try {
      const authors = await resolveIdentitiesBatch([...bbs.site.bannedDids]);
      for (const did of bbs.site.bannedDids)
        bannedHandles[did] = authors[did]?.handle ?? did;
    } catch {
      for (const did of bbs.site.bannedDids) bannedHandles[did] = did;
    }
  }

  const hidden = await hydrateHiddenPosts(bbs.site.hiddenPosts);

  return { user, bbs, banRkeys, bannedHandles, hideRkeys, hidden };
}
