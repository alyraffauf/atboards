/**
 * Route loaders. Each one returns a plain data object that the matching
 * page reads via useLoaderData(). Nested routes use useRouteLoaderData("bbs")
 * to grab the parent loader's BBS without re-fetching.
 */

import { redirect, type LoaderFunctionArgs } from "react-router-dom";
import { ensureAuthReady, getCurrentUser } from "./lib/auth";
import { resolveBBS, type BBS } from "./lib/bbs";
import {
  getRecord,
  getRecordByUri,
  getBacklinks,
  getRecordsBatch,
  listRecords,
  resolveIdentitiesBatch,
  resolveIdentity,
  fetchAndHydrate,
  type ATRecord,
} from "./lib/atproto";
import {
  SITE,
  THREAD,
  REPLY,
  BAN,
  HIDE,
  BOARD,
  NEWS,
} from "./lib/lexicon";
import { makeAtUri, parseAtUri } from "./lib/util";

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

export async function boardLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const slug = params.slug!;
  const bbs = await resolveBBS(handle);
  const board = bbs.site.boards.find((b) => b.slug === slug);
  if (!board) throw new Response("Board not found", { status: 404 });

  const boardUri = makeAtUri(bbs.identity.did, BOARD, slug);
  const backlinks = await getBacklinks(boardUri, `${THREAD}:board`, 50);
  const records = await getRecordsBatch(backlinks.records);
  const filtered = records.filter((r) => {
    const { did } = parseAtUri(r.uri);
    if (bbs.site.bannedDids.has(did)) return false;
    if (bbs.site.hiddenPosts.has(r.uri)) return false;
    return true;
  });
  const dids = filtered.map((r) => parseAtUri(r.uri).did);
  const authors = await resolveIdentitiesBatch(dids);
  const threads: ThreadItem[] = filtered
    .filter((r) => parseAtUri(r.uri).did in authors)
    .map((r: ATRecord) => {
      const p = parseAtUri(r.uri);
      const v = r.value as any;
      return {
        uri: r.uri,
        did: p.did,
        rkey: p.rkey,
        handle: authors[p.did].handle,
        title: v.title,
        body: v.body,
        createdAt: v.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    handle,
    bbs,
    board,
    threads,
    cursor: backlinks.cursor ?? null,
  };
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

  const bbs = await resolveBBS(handle);
  const [tr, author] = await Promise.all([
    getRecord(did, THREAD, tid),
    resolveIdentity(did),
  ]);
  const tv = tr.value as any;
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
    attachments: tv.attachments,
  };

  const threadUri = makeAtUri(did, THREAD, tid);
  const bl = await getBacklinks(threadUri, `${REPLY}:subject`, 1000);
  const allRefs = [...bl.records].reverse(); // oldest first

  return { handle, bbs, thread, allRefs };
}

// --- Account / inbox ---

export interface InboxItem {
  type: "reply" | "quote";
  threadTitle: string;
  threadUri: string;
  replyUri: string;
  handle: string;
  body: string;
  createdAt: string;
}

export async function accountLoader() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/login");

  // Probe site record (fast — keep awaited so the page can render with it)
  let hasBBS = false;
  let bbsName: string | null = null;
  try {
    const r = await getRecord(user.did, SITE, "self");
    hasBBS = true;
    bbsName = ((r.value as any).name as string) ?? user.handle;
  } catch {
    // no site
  }

  // Inbox lookup is slow — return the promise unawaited so the page renders
  // immediately and items stream in via <Await>. (v7 auto-defers promises.)
  const itemsPromise = fetchInbox(user.did, user.pdsUrl);
  return { user, hasBBS, bbsName, items: itemsPromise };
}

async function fetchInbox(
  did: string,
  pdsUrl: string,
): Promise<InboxItem[]> {
  const SCAN_LIMIT = 50;
  const [threads, replies] = await Promise.all([
    listRecords(pdsUrl, did, THREAD, SCAN_LIMIT),
    listRecords(pdsUrl, did, REPLY, SCAN_LIMIT),
  ]);

  const results = await Promise.all([
    ...threads.map(async (tr) => {
      const v = tr.value as any;
      try {
        const { records } = await fetchAndHydrate(tr.uri, `${REPLY}:subject`, {
          limit: 50,
          excludeDid: did,
        });
        return records.map<InboxItem>((r) => ({
          type: "reply",
          threadTitle: v.title ?? "",
          threadUri: tr.uri,
          replyUri: r.uri,
          handle: r.handle,
          body: ((r.value.body as string) ?? "").substring(0, 200),
          createdAt: (r.value.createdAt as string) ?? "",
        }));
      } catch {
        return [];
      }
    }),
    ...replies.map(async (rr) => {
      const v = rr.value as any;
      try {
        const { records } = await fetchAndHydrate(rr.uri, `${REPLY}:quote`, {
          limit: 50,
          excludeDid: did,
        });
        return records.map<InboxItem>((r) => ({
          type: "quote",
          threadTitle: "",
          threadUri: v.subject ?? "",
          replyUri: r.uri,
          handle: r.handle,
          body: ((r.value.body as string) ?? "").substring(0, 200),
          createdAt: (r.value.createdAt as string) ?? "",
        }));
      } catch {
        return [];
      }
    }),
  ]);

  const seen = new Map<string, InboxItem>();
  for (const item of results.flat()) {
    const key = item.handle + item.body + item.createdAt;
    if (!seen.has(key) || item.type === "quote") seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

// --- Sysop ---

export async function requireAuthLoader() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/login");
  return { user };
}

export async function sysopEditLoader() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/login");
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

export async function sysopModerateLoader() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) throw redirect("/login");

  let bbs: BBS;
  try {
    bbs = await resolveBBS(user.handle);
  } catch {
    throw redirect("/account/create");
  }

  const banRecs = await listRecords(user.pdsUrl, user.did, BAN);
  const banRkeys: Record<string, string> = {};
  for (const r of banRecs)
    banRkeys[(r.value as any).did as string] = parseAtUri(r.uri).rkey;

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

  const hideRecs = await listRecords(user.pdsUrl, user.did, HIDE);
  const hideRkeys: Record<string, string> = {};
  for (const r of hideRecs)
    hideRkeys[(r.value as any).uri as string] = parseAtUri(r.uri).rkey;

  const hidden: HiddenInfo[] = [];
  for (const uri of bbs.site.hiddenPosts) {
    const did = parseAtUri(uri).did;
    let handle = did;
    try {
      handle = (await resolveIdentity(did)).handle;
    } catch {}
    try {
      const rec = await getRecordByUri(uri);
      const v = rec.value as any;
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

  return { user, bbs, banRkeys, bannedHandles, hideRkeys, hidden };
}

// Quiet "unused" lints if a future bundler trims dead imports
void NEWS;
