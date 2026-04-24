/** Fetch the user's own root posts (threads) across all BBSes. */

import { listRecords, resolveIdentitiesBatch } from "./atproto";
import { POST } from "./lexicon";
import { parseAtUri } from "./util";
import { isPostRecord } from "./recordGuards";

export interface MyThread {
  uri: string;
  rkey: string;
  title: string;
  body: string;
  createdAt: string;
  bbsDid: string;
  bbsHandle: string;
}

export async function fetchMyThreads(
  pdsUrl: string,
  did: string,
): Promise<MyThread[]> {
  const records = await listRecords(pdsUrl, did, POST);
  const rootPosts = records
    .filter(isPostRecord)
    .filter((record) => !record.value.root && record.value.title);
  if (!rootPosts.length) return [];

  const bbsDids = new Set(
    rootPosts.map((record) => parseAtUri(record.value.scope).did),
  );
  const identities = await resolveIdentitiesBatch([...bbsDids]);

  const results: MyThread[] = [];
  for (const record of rootPosts) {
    const bbsDid = parseAtUri(record.value.scope).did;
    const identity = identities[bbsDid];
    if (!identity) continue;
    results.push({
      uri: record.uri,
      rkey: parseAtUri(record.uri).rkey,
      title: record.value.title ?? "",
      body: record.value.body,
      createdAt: record.value.createdAt,
      bbsDid,
      bbsHandle: identity.handle,
    });
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}
