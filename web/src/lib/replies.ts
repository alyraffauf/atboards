/** Pure helpers for reply pagination and hydration. */

import { type BacklinkRef } from "./atproto";
import { parseAtUri } from "./util";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as replySchema } from "../lexicons/types/xyz/atboards/reply";
import type { XyzAtboardsReply } from "../lexicons";
import type { Reply } from "../components/post/ReplyCard";

export type { BacklinkRef };

export const REPLIES_PER_PAGE = 10;

export function refToUri(ref: BacklinkRef): string {
  return `at://${ref.did}/${ref.collection}/${ref.rkey}`;
}

export function pageForReply(
  refs: BacklinkRef[],
  replyUri: string | null,
): number | null {
  if (!replyUri) return null;
  const index = refs.findIndex((ref) => refToUri(ref) === replyUri);
  return index >= 0 ? Math.floor(index / REPLIES_PER_PAGE) + 1 : null;
}

export function rkeyFromHash(): string | null {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return hash.startsWith("#reply-") ? hash.slice(7) : null;
}

export function pageForRkey(
  refs: BacklinkRef[],
  rkey: string | null,
): number | null {
  if (!rkey) return null;
  const index = refs.findIndex((ref) => ref.rkey === rkey);
  return index >= 0 ? Math.floor(index / REPLIES_PER_PAGE) + 1 : null;
}

export function clampPage(page: number, totalRefs: number): number {
  const totalPages = Math.max(1, Math.ceil(totalRefs / REPLIES_PER_PAGE));
  return Math.max(1, Math.min(page, totalPages));
}

export function recordToReply(
  record: { uri: string; value: Record<string, unknown> },
  authors: Record<string, { handle: string; pds?: string }>,
): Reply | null {
  const { did, rkey } = parseAtUri(record.uri);
  if (!(did in authors)) return null;
  if (!is(replySchema, record.value)) return null;
  const value = record.value as unknown as XyzAtboardsReply.Main;
  return {
    uri: record.uri,
    did,
    rkey,
    handle: authors[did].handle,
    pds: authors[did].pds ?? "",
    body: value.body,
    createdAt: value.createdAt,
    quote: value.quote ?? null,
    attachments: (value.attachments ?? []) as Reply["attachments"],
  };
}
