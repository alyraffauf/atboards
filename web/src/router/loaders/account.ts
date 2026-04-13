import { getRecord } from "../../lib/atproto";
import { fetchInbox } from "../../lib/inbox";
import { fetchPins } from "../../lib/pins";
import { fetchMyThreads } from "../../lib/mythreads";
import { SITE } from "../../lib/lexicon";
import { requireAuth } from "./auth";

export type { InboxItem } from "../../lib/inbox";
export type { PinnedBBS } from "../../lib/pins";
export type { MyThread } from "../../lib/mythreads";

export async function accountLoader() {
  const user = await requireAuth();

  let hasBBS = false;
  let bbsName: string | null = null;
  try {
    const siteRecord = await getRecord(user.did, SITE, "self");
    hasBBS = true;
    const siteValue = siteRecord.value as unknown as { name?: string };
    bbsName = siteValue.name ?? user.handle;
  } catch {
    // no site
  }

  const itemsPromise = fetchInbox(user.did, user.pdsUrl);
  const pinsPromise = fetchPins(user.pdsUrl, user.did);
  const threadsPromise = fetchMyThreads(user.pdsUrl, user.did);
  return {
    user,
    hasBBS,
    bbsName,
    items: itemsPromise,
    pins: pinsPromise,
    threads: threadsPromise,
  };
}

export async function requireAuthLoader() {
  return { user: await requireAuth() };
}
