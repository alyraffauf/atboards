/** Fetch the list of news posts a sysop has published to their site. */

import { getBacklinks, getRecordsBatch } from "./atproto";
import { POST, SITE } from "./lexicon";
import { makeAtUri, parseAtUri } from "./util";
import { isPostRecord } from "./recordGuards";
import type { NewsPost } from "./bbs";

export async function fetchNews(bbsDid: string): Promise<NewsPost[]> {
  const siteUri = makeAtUri(bbsDid, SITE, "self");
  const backlinks = await getBacklinks(siteUri, `${POST}:scope`, 50).catch(
    () => null,
  );
  if (!backlinks) return [];

  const sysopRefs = backlinks.records.filter((ref) => ref.did === bbsDid);
  const records = await getRecordsBatch(sysopRefs);

  const news: NewsPost[] = records
    .filter(isPostRecord)
    .filter((record) => record.value.title && !record.value.root)
    .map((record) => ({
      uri: record.uri,
      rkey: parseAtUri(record.uri).rkey,
      title: record.value.title ?? "",
      body: record.value.body,
      createdAt: record.value.createdAt,
      attachments: record.value.attachments as NewsPost["attachments"],
    }));

  news.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return news;
}
