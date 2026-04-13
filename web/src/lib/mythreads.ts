/** Fetch the user's own threads across all BBSes. */

import { listRecords, resolveIdentitiesBatch } from "./atproto";
import { THREAD } from "./lexicon";
import { parseAtUri } from "./util";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as threadSchema } from "../lexicons/types/xyz/atboards/thread";
import type { XyzAtboardsThread } from "../lexicons";

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
  const records = await listRecords(pdsUrl, did, THREAD);
  const threadRecords = records.filter((record) =>
    is(threadSchema, record.value),
  );
  if (!threadRecords.length) return [];

  const bbsDids = new Set(
    threadRecords.map((record) => {
      const value = record.value as unknown as XyzAtboardsThread.Main;
      return parseAtUri(value.board).did;
    }),
  );
  const identities = await resolveIdentitiesBatch([...bbsDids]);

  const results: MyThread[] = [];
  for (const record of threadRecords) {
    const value = record.value as unknown as XyzAtboardsThread.Main;
    const bbsDid = parseAtUri(value.board).did;
    const identity = identities[bbsDid];
    if (!identity) continue;
    results.push({
      uri: record.uri,
      rkey: parseAtUri(record.uri).rkey,
      title: value.title,
      body: value.body,
      createdAt: value.createdAt,
      bbsDid,
      bbsHandle: identity.handle,
    });
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}
