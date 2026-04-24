/** Fetch and resolve the user's pinned BBSes. */

import {
  getAvatars,
  getRecord,
  listRecords,
  resolveIdentitiesBatch,
} from "./atproto";
import { PIN, SITE } from "./lexicon";
import { isPinRecord, isSiteRecord } from "./recordGuards";
import { parseAtUri } from "./util";

export interface PinnedBBS {
  did: string;
  rkey: string;
  handle: string;
  name: string;
  createdAt: string;
  avatar?: string;
}

export async function fetchPins(
  pdsUrl: string,
  did: string,
): Promise<PinnedBBS[]> {
  const records = await listRecords(pdsUrl, did, PIN);
  const pinRecords = records.filter(isPinRecord);

  const pinnedDids = pinRecords.map((record) => record.value.did);
  if (!pinnedDids.length) return [];

  const [identities, siteResults, avatars] = await Promise.all([
    resolveIdentitiesBatch(pinnedDids),
    Promise.allSettled(
      pinnedDids.map((pinnedDid) => getRecord(pinnedDid, SITE, "self")),
    ),
    getAvatars(pinnedDids),
  ]);

  const siteNames: Record<string, string> = {};
  siteResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    if (!isSiteRecord(result.value)) return;
    siteNames[pinnedDids[index]] = result.value.value.name;
  });

  const results: PinnedBBS[] = [];
  for (const record of pinRecords) {
    const identity = identities[record.value.did];
    if (!identity) continue;
    results.push({
      did: record.value.did,
      rkey: parseAtUri(record.uri).rkey,
      handle: identity.handle,
      name: siteNames[record.value.did] ?? identity.handle,
      createdAt: record.value.createdAt,
      avatar: avatars[record.value.did],
    });
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}

export function findPinRkey(
  pins: PinnedBBS[],
  targetDid: string,
): string | null {
  const match = pins.find((entry) => entry.did === targetDid);
  return match ? match.rkey : null;
}
