/** Authenticated PDS write helpers using an atcute Client from useAuth().agent. */

import type { Client } from "@atcute/client";
import { SITE, BOARD, NEWS, THREAD, REPLY, BAN, HIDE } from "./lexicon";
import { invalidateBBSCache } from "./bbs";
import { nowIso } from "./util";
import { getCurrentUser } from "./auth";
import type {
  XyzAtbbsThread,
  XyzAtbbsReply,
  XyzAtbbsSite,
  XyzAtbbsBoard,
  XyzAtbbsNews,
  XyzAtbbsBan,
  XyzAtbbsHide,
} from "../lexicons";

// --- Lexicon value types ---

// Strip $type so a single Attachment value works for both thread and reply.
type Attachment = Omit<XyzAtbbsThread.Attachment, "$type">;

type ThreadValue = Omit<XyzAtbbsThread.Main, "$type">;
type ReplyValue = Omit<XyzAtbbsReply.Main, "$type">;
type SiteValue = Omit<XyzAtbbsSite.Main, "$type">;
type BoardValue = Omit<XyzAtbbsBoard.Main, "$type">;
type NewsValue = Omit<XyzAtbbsNews.Main, "$type">;
type BanValue = Omit<XyzAtbbsBan.Main, "$type">;
type HideValue = Omit<XyzAtbbsHide.Main, "$type">;

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

// --- Type assertions for atcute's strict template-string types ---

type Did = `did:${string}:${string}`;
type Nsid = `${string}.${string}.${string}`;

const asDid = (value: string) => value as Did;
const asNsid = (value: string) => value as Nsid;

function currentDid(): Did {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return asDid(user.did);
}

// --- Generic record CRUD ---

function assertOk(
  resp: { ok: boolean; data: unknown },
  label: string,
): asserts resp is { ok: true; data: unknown } {
  if (!resp.ok) {
    const message = (resp.data as { message?: string })?.message;
    throw new Error(message ?? `${label} failed`);
  }
}

async function createRecord<V extends object>(
  rpc: Client,
  collection: string,
  value: V,
  rkey?: string,
) {
  const resp = await rpc.post("com.atproto.repo.createRecord", {
    input: {
      repo: currentDid(),
      collection: asNsid(collection),
      ...(rkey ? { rkey } : {}),
      record: { $type: collection, ...value },
    },
  });
  assertOk(resp, "createRecord");
  return resp;
}

async function putRecord<V extends object>(
  rpc: Client,
  collection: string,
  rkey: string,
  value: V,
) {
  const resp = await rpc.post("com.atproto.repo.putRecord", {
    input: {
      repo: currentDid(),
      collection: asNsid(collection),
      rkey,
      record: { $type: collection, ...value },
    },
  });
  assertOk(resp, "putRecord");
  return resp;
}

export async function deleteRecord(
  rpc: Client,
  collection: string,
  rkey: string,
) {
  const resp = await rpc.post("com.atproto.repo.deleteRecord", {
    input: {
      repo: currentDid(),
      collection: asNsid(collection),
      rkey,
    },
  });
  assertOk(resp, "deleteRecord");
  return resp;
}

// --- Blob upload ---

async function uploadBlob(rpc: Client, file: File): Promise<BlobRef> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // atcute's typed upload signature is awkward for raw binary; cast at boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await rpc.post("com.atproto.repo.uploadBlob", {
    input: buf,
    headers: {
      "content-type": file.type || "application/octet-stream",
    },
  } as any);
  if (!resp.ok) {
    const message = (resp.data as { message?: string })?.message;
    throw new Error(message ?? "uploadBlob failed");
  }
  return (resp.data as { blob: BlobRef }).blob;
}

export async function uploadAttachments(
  rpc: Client,
  files: File[],
): Promise<Attachment[]> {
  if (files.length === 0) return [];
  const out: Attachment[] = [];
  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > 1_000_000) throw new Error(`${file.name} exceeds 1MB`);
    const blob = await uploadBlob(rpc, file);
    out.push({
      file: blob as unknown as Attachment["file"],
      name: file.name,
    });
  }
  return out;
}

// --- Threads & replies ---

export async function createThread(
  rpc: Client,
  boardUri: string,
  title: string,
  body: string,
  attachments?: Attachment[],
) {
  const value: ThreadValue = {
    board: boardUri as ThreadValue["board"],
    title,
    body,
    createdAt: nowIso(),
    ...(attachments?.length ? { attachments } : {}),
  };
  return createRecord(rpc, THREAD, value);
}

export async function createReply(
  rpc: Client,
  threadUri: string,
  body: string,
  quote?: string | null,
  attachments?: Attachment[],
) {
  const value: ReplyValue = {
    subject: threadUri as ReplyValue["subject"],
    body,
    createdAt: nowIso(),
    ...(quote ? { quote: quote as ReplyValue["quote"] } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };
  return createRecord(rpc, REPLY, value);
}

// --- Sysop: site, board, news ---

export async function putSite(rpc: Client, site: SiteValue) {
  const resp = await putRecord(rpc, SITE, "self", site);
  invalidateBBSCache();
  return resp;
}

export async function putBoard(
  rpc: Client,
  slug: string,
  name: string,
  description: string,
  createdAt: string,
) {
  const value: BoardValue = {
    name,
    description,
    createdAt: createdAt as BoardValue["createdAt"],
  };
  const resp = await putRecord(rpc, BOARD, slug, value);
  invalidateBBSCache();
  return resp;
}

export async function createNews(
  rpc: Client,
  siteUri: string,
  title: string,
  body: string,
  attachments?: Attachment[],
) {
  const value: NewsValue = {
    site: siteUri as NewsValue["site"],
    title,
    body,
    createdAt: nowIso(),
    ...(attachments?.length
      ? { attachments: attachments as NewsValue["attachments"] }
      : {}),
  };
  return createRecord(rpc, NEWS, value);
}

// --- Sysop: bans & hides ---

export async function createBan(rpc: Client, did: string) {
  const value: BanValue = {
    did: did as BanValue["did"],
    createdAt: nowIso(),
  };
  const resp = await createRecord(rpc, BAN, value);
  invalidateBBSCache();
  return resp;
}

export async function createHide(rpc: Client, uri: string) {
  const value: HideValue = {
    uri: uri as HideValue["uri"],
    createdAt: nowIso(),
  };
  const resp = await createRecord(rpc, HIDE, value);
  invalidateBBSCache();
  return resp;
}
