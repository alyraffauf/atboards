import { getRecord } from "../../lib/atproto";
import { ensureAuthReady, getCurrentUser } from "../../lib/auth";
import { fetchInbox } from "../../lib/inbox";
import { fetchPins } from "../../lib/pins";
import { fetchMyThreads } from "../../lib/mythreads";
import { SITE } from "../../lib/lexicon";

export async function homeLoader() {
  await ensureAuthReady();
  const user = getCurrentUser();
  if (!user) return { user: null };

  let hasBBS = false;
  let bbsName: string | null = null;
  try {
    const siteRecord = await getRecord(user.did, SITE, "self");
    hasBBS = true;
    const siteValue = siteRecord.value as unknown as { name?: string };
    bbsName = siteValue.name ?? user.handle;
  } catch {
    // no site record
  }

  return {
    user,
    hasBBS,
    bbsName,
    items: fetchInbox(user.did, user.pdsUrl),
    pins: fetchPins(user.pdsUrl, user.did),
    threads: fetchMyThreads(user.pdsUrl, user.did),
  };
}
