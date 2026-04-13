/** Authenticated PDS write helpers using an atcute Client from useAuth().agent. */

import type { Client } from "@atcute/client";
import { SITE, BOARD, NEWS, THREAD, REPLY, BAN, HIDE } from "./lexicon";
import { nowIso } from "./util";
import { getCurrentUser } from "./auth";
import type {
  XyzAtboardsThread,
  XyzAtboardsReply,
  XyzAtboardsSite,
  XyzAtboardsBoard,
  XyzAtboardsNews,
  XyzAtboardsBan,
  XyzAtboardsHide,
} from "../lexicons";

// --- Lexicon value types ---

// Strip $type so a single Attachment value works for both thread and reply.
type Attachment = Omit<XyzAtboardsThread.Attachment, "$type">;

type ThreadValue = Omit<XyzAtboardsThread.Main, "$type">;
type ReplyValue = Omit<XyzAtboardsReply.Main, "$type">;
type SiteValue = Omit<XyzAtboardsSite.Main, "$type">;
type BoardValue = Omit<XyzAtboardsBoard.Main, "$type">;
type NewsValue = Omit<XyzAtboardsNews.Main, "$type">;
type BanValue = Omit<XyzAtboardsBan.Main, "$type">;
type HideValue = Omit<XyzAtboardsHide.Main, "$type">;

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

// --- Type assertions for atcute's strict template-string types ---

type Did = `did:${string}:${string}`;
type Nsid = `${string}.${string}.${string}`;

const asDid = (s: string) => s as Did;
const asNsid = (s: string) => s as Nsid;

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
  files: FileList | File[] | null,
): Promise<Attachment[]> {
  if (!files || files.length === 0) return [];
  const out: Attachment[] = [];
  for (const file of Array.from(files)) {
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
  return putRecord(rpc, SITE, "self", site);
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
  return putRecord(rpc, BOARD, slug, value);
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
  return createRecord(rpc, BAN, value);
}

export async function createHide(rpc: Client, uri: string) {
  const value: HideValue = {
    uri: uri as HideValue["uri"],
    createdAt: nowIso(),
  };
  return createRecord(rpc, HIDE, value);
}
