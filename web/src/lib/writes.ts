/** Authenticated PDS write helpers using an atcute Client from useAuth().agent. */

import type { Client } from "@atcute/client";
import { SITE, BOARD, POST, BAN, HIDE, PIN, PROFILE } from "./lexicon";
import { invalidateAllBBSCaches } from "./bbs";
import { queryClient } from "./queryClient";
import type { ATRecord } from "./atproto";
import { nowIso, parseAtUri } from "./util";
import { getCurrentUser } from "./auth";
import type {
  XyzAtbbsPost,
  XyzAtbbsSite,
  XyzAtbbsBoard,
  XyzAtbbsBan,
  XyzAtbbsHide,
  XyzAtbbsPin,
  XyzAtbbsProfile,
} from "../lexicons";

// --- Lexicon value types ---

// Strip $type so a single Attachment value works for posts.
type Attachment = Omit<XyzAtbbsPost.Attachment, "$type">;

type PostValue = Omit<XyzAtbbsPost.Main, "$type">;
type SiteValue = Omit<XyzAtbbsSite.Main, "$type">;
type BoardValue = Omit<XyzAtbbsBoard.Main, "$type">;
type BanValue = Omit<XyzAtbbsBan.Main, "$type">;
type HideValue = Omit<XyzAtbbsHide.Main, "$type">;
type PinValue = Omit<XyzAtbbsPin.Main, "$type">;
type ProfileValue = Omit<XyzAtbbsProfile.Main, "$type">;

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

// Seed the per-record cache used by getRecord so immediate re-reads (e.g. a
// refetch of profileQuery after putProfile) see the new value instead of the
// pre-write cached entry.
function syncRecordCache<V extends object>(
  did: string,
  collection: string,
  rkey: string,
  value: V,
  uri: string,
  cid: string,
) {
  queryClient.setQueryData<ATRecord>(["record", did, collection, rkey], {
    uri,
    cid,
    value: { $type: collection, ...value },
  });
}

async function createRecord<V extends object>(
  rpc: Client,
  collection: string,
  value: V,
  rkey?: string,
) {
  const did = currentDid();
  const resp = await rpc.post("com.atproto.repo.createRecord", {
    input: {
      repo: did,
      collection: asNsid(collection),
      ...(rkey ? { rkey } : {}),
      record: { $type: collection, ...value },
    },
  });
  assertOk(resp, "createRecord");
  const createdRkey = parseAtUri(resp.data.uri).rkey;
  syncRecordCache(
    did,
    collection,
    createdRkey,
    value,
    resp.data.uri,
    resp.data.cid,
  );
  return resp;
}

async function putRecord<V extends object>(
  rpc: Client,
  collection: string,
  rkey: string,
  value: V,
) {
  const did = currentDid();
  const resp = await rpc.post("com.atproto.repo.putRecord", {
    input: {
      repo: did,
      collection: asNsid(collection),
      rkey,
      record: { $type: collection, ...value },
    },
  });
  assertOk(resp, "putRecord");
  syncRecordCache(did, collection, rkey, value, resp.data.uri, resp.data.cid);
  return resp;
}

export async function deleteRecord(
  rpc: Client,
  collection: string,
  rkey: string,
) {
  const did = currentDid();
  const resp = await rpc.post("com.atproto.repo.deleteRecord", {
    input: {
      repo: did,
      collection: asNsid(collection),
      rkey,
    },
  });
  assertOk(resp, "deleteRecord");
  // Drop the per-record cache entry from the cache
  queryClient.removeQueries({
    queryKey: ["record", did, collection, rkey],
    exact: true,
  });
  return resp;
}

// --- Blob upload ---

async function stripImageMetadata(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: file.type });
  return new File([blob], file.name, { type: file.type });
}

async function uploadBlob(rpc: Client, file: File): Promise<BlobRef> {
  const cleanedFile = await stripImageMetadata(file);
  const fileBytes = new Uint8Array(await cleanedFile.arrayBuffer());
  // atcute's typed upload signature is awkward for raw binary; cast at boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await rpc.post("com.atproto.repo.uploadBlob", {
    input: fileBytes,
    headers: {
      "content-type": cleanedFile.type || "application/octet-stream",
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
    const blob = await uploadBlob(rpc, file);
    out.push({
      file: blob as unknown as Attachment["file"],
      name: file.name,
    });
  }
  return out;
}

// --- Posts (threads, replies, news) ---

export async function createPost(
  rpc: Client,
  scope: string,
  body: string,
  opts?: {
    title?: string;
    root?: string;
    parent?: string;
    attachments?: Attachment[];
  },
) {
  const value: PostValue = {
    scope: scope as PostValue["scope"],
    body,
    createdAt: nowIso(),
    ...(opts?.title ? { title: opts.title } : {}),
    ...(opts?.root ? { root: opts.root as PostValue["root"] } : {}),
    ...(opts?.parent ? { parent: opts.parent as PostValue["parent"] } : {}),
    ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
  };
  return createRecord(rpc, POST, value);
}

// --- Sysop: site, board ---

export async function putSite(rpc: Client, site: SiteValue) {
  const resp = await putRecord(rpc, SITE, "self", site);
  invalidateAllBBSCaches();
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
  invalidateAllBBSCaches();
  return resp;
}

// --- Sysop: bans & hides ---

export async function createBan(rpc: Client, did: string) {
  const value: BanValue = {
    did: did as BanValue["did"],
    createdAt: nowIso(),
  };
  const resp = await createRecord(rpc, BAN, value);
  invalidateAllBBSCaches();
  return resp;
}

export async function createHide(rpc: Client, uri: string) {
  const value: HideValue = {
    uri: uri as HideValue["uri"],
    createdAt: nowIso(),
  };
  const resp = await createRecord(rpc, HIDE, value);
  invalidateAllBBSCaches();
  return resp;
}

// --- Pins ---

export async function createPin(rpc: Client, did: string) {
  const value: PinValue = {
    did: did as PinValue["did"],
    createdAt: nowIso(),
  };
  // Use DID as rkey for idempotent pins
  return createRecord(rpc, PIN, value, did);
}

// --- Profiles ---

export async function putProfile(
  rpc: Client,
  name?: string,
  pronouns?: string,
  bio?: string,
) {
  const value: ProfileValue = {
    ...(name ? { name } : {}),
    ...(pronouns ? { pronouns } : {}),
    ...(bio ? { bio } : {}),
    createdAt: nowIso() as ProfileValue["createdAt"],
  };
  return putRecord(rpc, PROFILE, "self", value);
}
