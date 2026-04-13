/** Fetch and resolve the user's pinned BBSes. */

import {
  listRecords,
  getRecord,
  resolveIdentitiesBatch,
} from "./atproto";
import { PIN, SITE } from "./lexicon";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as pinSchema } from "../lexicons/types/xyz/atboards/pin";
import { mainSchema as siteSchema } from "../lexicons/types/xyz/atboards/site";
import type { XyzAtboardsPin, XyzAtboardsSite } from "../lexicons";
import { parseAtUri } from "./util";

export interface PinnedBBS {
  did: string;
  rkey: string;
  handle: string;
  name: string;
  createdAt: string;
}

export async function fetchPins(
  pdsUrl: string,
  did: string,
): Promise<PinnedBBS[]> {
  const records = await listRecords(pdsUrl, did, PIN);
  const pinRecords = records.filter((record) => is(pinSchema, record.value));

  const pinnedDids = pinRecords.map(
    (record) => (record.value as unknown as XyzAtboardsPin.Main).did,
  );
  if (!pinnedDids.length) return [];

  const identities = await resolveIdentitiesBatch(pinnedDids);

  const siteResults = await Promise.allSettled(
    pinnedDids.map((pinnedDid) => getRecord(pinnedDid, SITE, "self")),
  );
  const siteNames: Record<string, string> = {};
  siteResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    if (!is(siteSchema, result.value.value)) return;
    const siteValue = result.value.value as unknown as XyzAtboardsSite.Main;
    siteNames[pinnedDids[index]] = siteValue.name;
  });

  const results: PinnedBBS[] = [];
  for (const record of pinRecords) {
    const value = record.value as unknown as XyzAtboardsPin.Main;
    const identity = identities[value.did];
    if (!identity) continue;
    results.push({
      did: value.did,
      rkey: parseAtUri(record.uri).rkey,
      handle: identity.handle,
      name: siteNames[value.did] ?? identity.handle,
      createdAt: value.createdAt,
    });
  }
  return results;
}

export function findPinRkey(
  pins: PinnedBBS[],
  targetDid: string,
): string | null {
  const match = pins.find((entry) => entry.did === targetDid);
  return match ? match.rkey : null;
}
