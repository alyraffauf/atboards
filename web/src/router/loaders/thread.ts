import type { LoaderFunctionArgs } from "react-router-dom";
import { resolveBBS } from "../../lib/bbs";
import {
  getRecord,
  getBacklinks,
  resolveIdentity,
  type BacklinkRef,
} from "../../lib/atproto";
import { THREAD, REPLY } from "../../lib/lexicon";
import { makeAtUri, parseAtUri } from "../../lib/util";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as threadSchema } from "../../lexicons/types/xyz/atbbs/thread";
import type { XyzAtbbsThread } from "../../lexicons";

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

export async function threadLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const did = params.did!;
  const tid = params.tid!;

  const threadUri = makeAtUri(did, THREAD, tid);
  const [bbs, threadRecord, author, allRefs] = await Promise.all([
    resolveBBS(handle),
    getRecord(did, THREAD, tid),
    resolveIdentity(did),
    collectAllReplyRefs(threadUri),
  ]);
  if (!is(threadSchema, threadRecord.value)) {
    throw new Response("Invalid thread record", { status: 404 });
  }
  const threadValue = threadRecord.value as unknown as XyzAtbbsThread.Main;
  const boardSlug = parseAtUri(threadValue.board).rkey;
  const thread: ThreadObj = {
    uri: threadRecord.uri,
    did,
    rkey: tid,
    authorHandle: author.handle,
    authorPds: author.pds ?? "",
    title: threadValue.title,
    body: threadValue.body,
    createdAt: threadValue.createdAt,
    boardSlug,
    attachments: threadValue.attachments as ThreadObj["attachments"],
  };

  return { handle, bbs, thread, allRefs };
}
