/** Resolve a handle to a fully hydrated BBS via Slingshot/Constellation. */

import {
  getRecord,
  getRecordsBatch,
  getBacklinks,
  listRecords,
  resolveIdentity,
  type MiniDoc,
  type ATRecord,
} from "./atproto";
import { SITE, BOARD, NEWS, BAN, HIDE } from "./lexicon";
import { makeAtUri, parseAtUri } from "./util";
import type {
  XyzAtboardsSite,
  XyzAtboardsBoard,
  XyzAtboardsNews,
  XyzAtboardsBan,
  XyzAtboardsHide,
} from "../lexicons";

export class BBSNotFoundError extends Error {}
export class NoBBSError extends Error {}
export class NetworkError extends Error {}

export interface Board {
  slug: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
}

export interface News {
  tid: string;
  siteUri: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface Site {
  name: string;
  description: string;
  intro: string;
  boards: Board[];
  bannedDids: Set<string>;
  hiddenPosts: Set<string>;
  createdAt: string;
  updatedAt?: string;
}

export interface BBS {
  identity: MiniDoc;
  site: Site;
  news: News[];
}

export async function resolveBBS(handle: string): Promise<BBS> {
  let identity: MiniDoc;
  try {
    identity = await resolveIdentity(handle);
  } catch (e) {
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

  const sv = siteRecord.value as unknown as XyzAtboardsSite.Main;
  const siteUri = makeAtUri(identity.did, SITE, "self");
  const boardSlugs: string[] = sv.boards ?? [];

  const [boardResults, newsBacklinks, banRecords, hideRecords] =
    await Promise.all([
      Promise.allSettled(
        boardSlugs.map((slug) => getRecord(identity.did, BOARD, slug)),
      ),
      getBacklinks(siteUri, `${NEWS}:site`, 50).catch(() => null),
      listRecords(identity.pds, identity.did, BAN).catch(() => []),
      listRecords(identity.pds, identity.did, HIDE).catch(() => []),
    ]);

  const boards: Board[] = [];
  boardResults.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const v = r.value.value as unknown as XyzAtboardsBoard.Main;
    boards.push({
      slug: boardSlugs[i],
      name: v.name,
      description: v.description,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });

  // News - only sysop's repo
  let news: News[] = [];
  if (newsBacklinks) {
    const sysopRefs = newsBacklinks.records.filter(
      (r) => r.did === identity.did,
    );
    const newsRecords = await getRecordsBatch(sysopRefs);
    news = newsRecords.map((r) => {
      const v = r.value as unknown as XyzAtboardsNews.Main;
      return {
        tid: parseAtUri(r.uri).rkey,
        siteUri: v.site,
        title: v.title,
        body: v.body,
        createdAt: v.createdAt,
      };
    });
    news.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const bannedDids = new Set(
    banRecords.map((r) => (r.value as unknown as XyzAtboardsBan.Main).did),
  );
  const hiddenPosts = new Set(
    hideRecords.map((r) => (r.value as unknown as XyzAtboardsHide.Main).uri),
  );

  return {
    identity,
    site: {
      name: sv.name,
      description: sv.description,
      intro: sv.intro,
      boards,
      bannedDids,
      hiddenPosts,
      createdAt: sv.createdAt ?? "",
      updatedAt: sv.updatedAt,
    },
    news,
  };
}
