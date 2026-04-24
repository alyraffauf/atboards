/** Activity data — replies to your posts from other users. */

import { fetchAndHydrate, listRecords } from "./atproto";
import { POST } from "./lexicon";
import { isPostRecord } from "./recordGuards";

export interface ActivityItem {
  type: "reply" | "parent_reply";
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
  type: ActivityItem["type"],
  threadTitle: string,
  threadUri: string,
): Promise<ActivityItem[]> {
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

export async function fetchActivity(
  did: string,
  pdsUrl: string,
): Promise<ActivityItem[]> {
  const SCAN_LIMIT = 50;
  const allPosts = await listRecords(pdsUrl, did, POST, SCAN_LIMIT);
  const validPosts = allPosts.filter(isPostRecord);

  const rootPosts = validPosts.filter((record) => !record.value.root);
  const replyPosts = validPosts.filter((record) => !!record.value.root);

  const results = await Promise.all([
    ...rootPosts.map((post) =>
      fetchBacklinkItems(
        post.uri,
        `${POST}:root`,
        did,
        "reply",
        post.value.title ?? "",
        post.uri,
      ),
    ),
    ...replyPosts.map((reply) =>
      fetchBacklinkItems(
        reply.uri,
        `${POST}:parent`,
        did,
        "parent_reply",
        "",
        reply.value.root ?? "",
      ),
    ),
  ]);

  // Deduplicate — prefer "parent-reply" type when the same reply appears as both.
  const seen = new Map<string, ActivityItem>();
  for (const item of results.flat()) {
    const key = item.handle + item.body + item.createdAt;
    if (!seen.has(key) || item.type === "parent_reply") seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
