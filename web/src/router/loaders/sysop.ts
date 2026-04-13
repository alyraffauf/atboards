import { redirect } from "react-router-dom";
import { resolveBBS, type BBS } from "../../lib/bbs";
import {
  getRecordByUri,
  listRecords,
  resolveIdentitiesBatch,
  resolveIdentity,
} from "../../lib/atproto";
import { BAN, HIDE } from "../../lib/lexicon";
import { parseAtUri } from "../../lib/util";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as banSchema } from "../../lexicons/types/xyz/atbbs/ban";
import { mainSchema as hideSchema } from "../../lexicons/types/xyz/atbbs/hide";
import type { XyzAtbbsBan, XyzAtbbsHide } from "../../lexicons";
import { requireAuth } from "./auth";

export interface HiddenInfo {
  uri: string;
  handle: string;
  title: string;
  body: string;
}

function buildRkeyMap<T>(
  records: { uri: string; value: Record<string, unknown> }[],
  schema: Parameters<typeof is>[0],
  getKey: (value: T) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const record of records) {
    if (!is(schema, record.value)) continue;
    map[getKey(record.value as unknown as T)] = parseAtUri(record.uri).rkey;
  }
  return map;
}

async function hydrateHiddenPosts(uris: Set<string>): Promise<HiddenInfo[]> {
  const hidden: HiddenInfo[] = [];
  for (const uri of uris) {
    const did = parseAtUri(uri).did;
    let handle = did;
    try {
      handle = (await resolveIdentity(did)).handle;
    } catch {}
    try {
      const record = await getRecordByUri(uri);
      const value = record.value as unknown as { title?: string; body?: string };
      hidden.push({
        uri,
        handle,
        title: value.title ?? "",
        body: (value.body ?? "").substring(0, 100),
      });
    } catch {
      hidden.push({ uri, handle, title: "", body: uri });
    }
  }
  return hidden;
}

export async function sysopEditLoader() {
  const user = await requireAuth();
  try {
    const bbs = await resolveBBS(user.handle);
    return { user, bbs };
  } catch {
    throw redirect("/account/create");
  }
}

export async function sysopModerateLoader() {
  const user = await requireAuth();

  let bbs: BBS;
  try {
    bbs = await resolveBBS(user.handle);
  } catch {
    throw redirect("/account/create");
  }

  const [banRecs, hideRecs] = await Promise.all([
    listRecords(user.pdsUrl, user.did, BAN),
    listRecords(user.pdsUrl, user.did, HIDE),
  ]);

  const banRkeys = buildRkeyMap<XyzAtbbsBan.Main>(
    banRecs,
    banSchema,
    (ban) => ban.did,
  );
  const hideRkeys = buildRkeyMap<XyzAtbbsHide.Main>(
    hideRecs,
    hideSchema,
    (hide) => hide.uri,
  );

  let bannedHandles: Record<string, string> = {};
  if (bbs.site.bannedDids.size) {
    try {
      const authors = await resolveIdentitiesBatch([...bbs.site.bannedDids]);
      for (const did of bbs.site.bannedDids)
        bannedHandles[did] = authors[did]?.handle ?? did;
    } catch {
      for (const did of bbs.site.bannedDids) bannedHandles[did] = did;
    }
  }

  const hidden = await hydrateHiddenPosts(bbs.site.hiddenPosts);

  return { user, bbs, banRkeys, bannedHandles, hideRkeys, hidden };
}
