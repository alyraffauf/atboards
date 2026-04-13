/** Inbox data fetching — replies to your threads + quotes of your replies. */

import { fetchAndHydrate, listRecords } from "./atproto";
import { THREAD, REPLY } from "./lexicon";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as threadSchema } from "../lexicons/types/xyz/atboards/thread";
import { mainSchema as replySchema } from "../lexicons/types/xyz/atboards/reply";
import type { XyzAtboardsThread, XyzAtboardsReply } from "../lexicons";

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
    return records.map((r) => ({
      type,
      threadTitle,
      threadUri,
      replyUri: r.uri,
      handle: r.handle,
      body: ((r.value.body as string) ?? "").substring(0, 200),
      createdAt: (r.value.createdAt as string) ?? "",
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
  const threads = allThreads.filter((r) => is(threadSchema, r.value));
  const replies = allReplies.filter((r) => is(replySchema, r.value));

  const results = await Promise.all([
    ...threads.map((tr) => {
      const v = tr.value as unknown as XyzAtboardsThread.Main;
      return fetchBacklinkItems(
        tr.uri,
        `${REPLY}:subject`,
        did,
        "reply",
        v.title ?? "",
        tr.uri,
      );
    }),
    ...replies.map((rr) => {
      const v = rr.value as unknown as XyzAtboardsReply.Main;
      return fetchBacklinkItems(
        rr.uri,
        `${REPLY}:quote`,
        did,
        "quote",
        "",
        v.subject ?? "",
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
