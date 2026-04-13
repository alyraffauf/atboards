/** Delete a user's entire BBS: boards, news, bans, hides, then the site record. */

import type { Client } from "@atcute/client";
import { getRecord, listRecords } from "./atproto";
import { BAN, BOARD, HIDE, NEWS, SITE } from "./lexicon";
import { parseAtUri } from "./util";
import { deleteRecord } from "./writes";

export async function deleteBBS(agent: Client, did: string, pdsUrl: string) {
  const failed: string[] = [];

  const existing = await getRecord(did, SITE, "self");
  const siteValue = existing.value as Record<string, unknown>;
  const boardSlugs: string[] = (
    Array.isArray(siteValue.boards) ? siteValue.boards : []
  ) as string[];

  for (const slug of boardSlugs) {
    try {
      await deleteRecord(agent, BOARD, slug);
    } catch {
      failed.push(`board/${slug}`);
    }
  }

  const newsRecords = await listRecords(pdsUrl, did, NEWS);
  for (const record of newsRecords) {
    try {
      await deleteRecord(agent, NEWS, parseAtUri(record.uri).rkey);
    } catch {
      failed.push(`news/${parseAtUri(record.uri).rkey}`);
    }
  }

  for (const collection of [BAN, HIDE]) {
    const records = await listRecords(pdsUrl, did, collection);
    for (const record of records) {
      try {
        await deleteRecord(agent, collection, parseAtUri(record.uri).rkey);
      } catch {
        failed.push(`${collection}/${parseAtUri(record.uri).rkey}`);
      }
    }
  }

  if (failed.length) {
    throw new Error(
      `Could not delete: ${failed.join(", ")}. Site record was not deleted.`,
    );
  }

  await deleteRecord(agent, SITE, "self");
}
