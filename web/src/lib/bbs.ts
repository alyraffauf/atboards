/** Resolve a handle to a fully hydrated BBS via Slingshot/Constellation. */

import { TTLCache } from "./cache";
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
import { is } from "@atcute/lexicons/validations";
import { mainSchema as siteSchema } from "../lexicons/types/xyz/atbbs/site";
import { mainSchema as boardSchema } from "../lexicons/types/xyz/atbbs/board";
import { mainSchema as newsSchema } from "../lexicons/types/xyz/atbbs/news";
import { mainSchema as banSchema } from "../lexicons/types/xyz/atbbs/ban";
import { mainSchema as hideSchema } from "../lexicons/types/xyz/atbbs/hide";
import type {
  XyzAtbbsSite,
  XyzAtbbsBoard,
  XyzAtbbsNews,
  XyzAtbbsBan,
  XyzAtbbsHide,
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

export interface NewsAttachment {
  file: { ref: { $link: string } };
  name: string;
}

export interface News {
  tid: string;
  siteUri: string;
  title: string;
  body: string;
  createdAt: string;
  attachments?: NewsAttachment[];
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

const bbsCache = new TTLCache<string, BBS>(5 * 60 * 1000);

export function invalidateBBSCache() {
  bbsCache.clear();
}

export async function resolveBBS(handle: string): Promise<BBS> {
  const cached = bbsCache.get(handle);
  if (cached) return cached;
  const bbs = await _resolveBBS(handle);
  bbsCache.set(handle, bbs);
  return bbs;
}

async function _resolveBBS(handle: string): Promise<BBS> {
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

  if (!is(siteSchema, siteRecord.value)) {
    throw new NoBBSError(`${handle} has an invalid site record.`);
  }
  const siteValue = siteRecord.value as unknown as XyzAtbbsSite.Main;
  const siteUri = makeAtUri(identity.did, SITE, "self");
  const boardSlugs: string[] = siteValue.boards ?? [];

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
  boardResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    if (!is(boardSchema, result.value.value)) return;
    const board = result.value.value as unknown as XyzAtbbsBoard.Main;
    boards.push({
      slug: boardSlugs[index],
      name: board.name,
      description: board.description,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    });
  });

  // News - only sysop's repo
  let news: News[] = [];
  if (newsBacklinks) {
    const sysopRefs = newsBacklinks.records.filter(
      (ref) => ref.did === identity.did,
    );
    const newsRecords = await getRecordsBatch(sysopRefs);
    news = newsRecords
      .filter((record) => is(newsSchema, record.value))
      .map((record) => {
        const value = record.value as unknown as XyzAtbbsNews.Main;
        return {
          tid: parseAtUri(record.uri).rkey,
          siteUri: value.site,
          title: value.title,
          body: value.body,
          createdAt: value.createdAt,
          attachments: value.attachments as NewsAttachment[] | undefined,
        };
      });
    news.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const bannedDids = new Set(
    banRecords
      .filter((record) => is(banSchema, record.value))
      .map((record) => (record.value as unknown as XyzAtbbsBan.Main).did),
  );
  const hiddenPosts = new Set(
    hideRecords
      .filter((record) => is(hideSchema, record.value))
      .map((record) => (record.value as unknown as XyzAtbbsHide.Main).uri),
  );

  return {
    identity,
    site: {
      name: siteValue.name,
      description: siteValue.description,
      intro: siteValue.intro,
      boards,
      bannedDids,
      hiddenPosts,
      createdAt: siteValue.createdAt ?? "",
      updatedAt: siteValue.updatedAt,
    },
    news,
  };
}
