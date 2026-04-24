/** Resolve a handle to a fully hydrated BBS via Slingshot/Constellation. */

import {
  getRecord,
  resolveIdentity,
  type MiniDoc,
  type ATRecord,
} from "./atproto";
import { queryClient } from "./queryClient";
import { SITE } from "./lexicon";
import { parseAtUri } from "./util";
import { isBoardRecord, isSiteRecord } from "./recordGuards";

export class BBSNotFoundError extends Error {}
export class NoBBSError extends Error {}

export interface Board {
  slug: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PostAttachment {
  file: { ref: { $link: string } };
  name: string;
}

export interface NewsPost {
  uri: string;
  rkey: string;
  title: string;
  body: string;
  createdAt: string;
  attachments?: PostAttachment[];
}

export interface Site {
  name: string;
  description: string;
  intro: string;
  boards: Board[];
  createdAt: string;
  updatedAt?: string;
}

export interface BBS {
  identity: MiniDoc;
  site: Site;
}

export function invalidateAllBBSCaches() {
  queryClient.invalidateQueries({ queryKey: ["bbs"] });
  queryClient.invalidateQueries({ queryKey: ["bbs-moderation"] });
  queryClient.invalidateQueries({ queryKey: ["sysop-moderation"] });
}

export async function resolveBBS(handle: string): Promise<BBS> {
  let identity: MiniDoc;
  try {
    identity = await resolveIdentity(handle);
  } catch {
    throw new BBSNotFoundError(`Could not resolve handle: ${handle}`);
  }
  if (!identity.pds) {
    throw new BBSNotFoundError(`No PDS for ${handle}`);
  }

  let siteRecord: ATRecord;
  try {
    siteRecord = await getRecord(identity.did, SITE, "self");
  } catch {
    throw new NoBBSError(`${handle} isn't running a BBS.`);
  }

  if (!isSiteRecord(siteRecord)) {
    throw new NoBBSError(`${handle} has an invalid site record.`);
  }
  const siteValue = siteRecord.value;
  const boardUris: string[] = siteValue.boards ?? [];

  const boardResults = await Promise.allSettled(
    boardUris.map((uri) => {
      const parsed = parseAtUri(uri);
      return getRecord(parsed.did, parsed.collection, parsed.rkey);
    }),
  );

  const boards: Board[] = [];
  boardResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    if (!isBoardRecord(result.value)) return;
    const board = result.value.value;
    const parsed = parseAtUri(boardUris[index]);
    boards.push({
      slug: parsed.rkey,
      name: board.name,
      description: board.description,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    });
  });

  return {
    identity,
    site: {
      name: siteValue.name,
      description: siteValue.description,
      intro: siteValue.intro,
      boards,
      createdAt: siteValue.createdAt ?? "",
      updatedAt: siteValue.updatedAt,
    },
  };
}
