/**
 * Authenticated PDS write helpers. All take an Agent (from useAuth().agent).
 * Mirrors core/records.py write functions.
 */

import { Agent } from "@atproto/api";
import { SITE, BOARD, NEWS, THREAD, REPLY, BAN, HIDE } from "./lexicon";
import { nowIso } from "./util";

export interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface Attachment {
  file: BlobRef;
  name: string;
}

async function createRecord(
  agent: Agent,
  collection: string,
  record: Record<string, unknown>,
  rkey?: string,
) {
  return agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection,
    rkey,
    record: { $type: collection, ...record },
  });
}

async function putRecord(
  agent: Agent,
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
) {
  return agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection,
    rkey,
    record: { $type: collection, ...record },
  });
}

export async function deleteRecord(
  agent: Agent,
  collection: string,
  rkey: string,
) {
  return agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection,
    rkey,
  });
}

export async function uploadBlob(agent: Agent, file: File): Promise<BlobRef> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const resp = await agent.com.atproto.repo.uploadBlob(buf, {
    encoding: file.type || "application/octet-stream",
  });
  return resp.data.blob as unknown as BlobRef;
}

export async function uploadAttachments(
  agent: Agent,
  files: FileList | File[] | null,
): Promise<Attachment[]> {
  if (!files || files.length === 0) return [];
  const arr = Array.from(files);
  const out: Attachment[] = [];
  for (const f of arr) {
    if (f.size === 0) continue;
    if (f.size > 1_000_000) throw new Error(`${f.name} exceeds 1MB`);
    const blob = await uploadBlob(agent, f);
    out.push({ file: blob, name: f.name });
  }
  return out;
}

// --- Threads & replies ---

export async function createThread(
  agent: Agent,
  boardUri: string,
  title: string,
  body: string,
  attachments?: Attachment[],
) {
  return createRecord(agent, THREAD, {
    board: boardUri,
    title,
    body,
    createdAt: nowIso(),
    ...(attachments?.length ? { attachments } : {}),
  });
}

export async function createReply(
  agent: Agent,
  threadUri: string,
  body: string,
  quote?: string | null,
  attachments?: Attachment[],
) {
  return createRecord(agent, REPLY, {
    subject: threadUri,
    body,
    createdAt: nowIso(),
    ...(quote ? { quote } : {}),
    ...(attachments?.length ? { attachments } : {}),
  });
}

// --- Sysop: site, board, news ---

export async function putSite(agent: Agent, site: Record<string, unknown>) {
  return putRecord(agent, SITE, "self", site);
}

export async function putBoard(
  agent: Agent,
  slug: string,
  name: string,
  description: string,
  createdAt: string,
) {
  return putRecord(agent, BOARD, slug, { name, description, createdAt });
}

export async function createNews(
  agent: Agent,
  siteUri: string,
  title: string,
  body: string,
) {
  return createRecord(agent, NEWS, {
    site: siteUri,
    title,
    body,
    createdAt: nowIso(),
  });
}

// --- Sysop: bans & hides ---

export async function createBan(agent: Agent, did: string) {
  return createRecord(agent, BAN, { did, createdAt: nowIso() });
}

export async function createHide(agent: Agent, uri: string) {
  return createRecord(agent, HIDE, { uri, createdAt: nowIso() });
}
