/** Inbox data fetching — replies to your threads + quotes of your replies. */

import { fetchAndHydrate, listRecords } from "./atproto";
import { THREAD, REPLY } from "./lexicon";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as threadSchema } from "../lexicons/types/xyz/atbbs/thread";
import { mainSchema as replySchema } from "../lexicons/types/xyz/atbbs/reply";
import type { XyzAtbbsThread, XyzAtbbsReply } from "../lexicons";

export interface InboxItem {
  type: "reply" | "quote";
  threadTitle: string;
  threadUri: string;
  replyUri: string;
  handle: string;
  body: string;
  createdAt: string;
}

async function fetchBacklinkItems(
  sourceUri: string,
  backlinkSource: string,
  excludeDid: string,
  type: InboxItem["type"],
  threadTitle: string,
  threadUri: string,
): Promise<InboxItem[]> {
  try {
    const { records } = await fetchAndHydrate(sourceUri, backlinkSource, {
      limit: 50,
      excludeDid,
    });
    return records.map((record) => ({
      type,
      threadTitle,
      threadUri,
      replyUri: record.uri,
      handle: record.handle,
      body: ((record.value.body as string) ?? "").substring(0, 200),
      createdAt: (record.value.createdAt as string) ?? "",
    }));
  } catch {
    return [];
  }
}

export async function fetchInbox(
  did: string,
  pdsUrl: string,
): Promise<InboxItem[]> {
  const SCAN_LIMIT = 50;
  const [allThreads, allReplies] = await Promise.all([
    listRecords(pdsUrl, did, THREAD, SCAN_LIMIT),
    listRecords(pdsUrl, did, REPLY, SCAN_LIMIT),
  ]);
  const threads = allThreads.filter((record) => is(threadSchema, record.value));
  const replies = allReplies.filter((record) => is(replySchema, record.value));

  const results = await Promise.all([
    ...threads.map((thread) => {
      const value = thread.value as unknown as XyzAtbbsThread.Main;
      return fetchBacklinkItems(
        thread.uri,
        `${REPLY}:subject`,
        did,
        "reply",
        value.title ?? "",
        thread.uri,
      );
    }),
    ...replies.map((reply) => {
      const value = reply.value as unknown as XyzAtbbsReply.Main;
      return fetchBacklinkItems(
        reply.uri,
        `${REPLY}:quote`,
        did,
        "quote",
        "",
        value.subject ?? "",
      );
    }),
  ]);

  // Deduplicate — prefer "quote" type when the same reply appears as both.
  const seen = new Map<string, InboxItem>();
  for (const item of results.flat()) {
    const key = item.handle + item.body + item.createdAt;
    if (!seen.has(key) || item.type === "quote") seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
