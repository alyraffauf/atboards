/** Fetch a random list of BBSes from the Lightrail API, with avatars. */

import { getAvatars, getRecord, resolveIdentitiesBatch } from "./atproto";
import { SITE } from "./lexicon";
import { SERVICES } from "./shared";
import { isSiteRecord } from "./recordGuards";

export interface DiscoveredBBS {
  did: string;
  handle: string;
  name: string;
  description: string;
  avatar?: string;
}

interface LightrailRepo {
  did: string;
}

export async function fetchDiscovery(): Promise<DiscoveredBBS[]> {
  let repos: LightrailRepo[] = [];
  try {
    const response = await fetch(
      `${SERVICES.lightrail}/com.atproto.sync.listReposByCollection?collection=${SITE}&limit=50`,
    );
    const data = (await response.json()) as { repos: LightrailRepo[] };
    repos = data.repos;
  } catch {
    return [];
  }
  if (!repos.length) return [];

  const shuffled = repos.sort(() => Math.random() - 0.5);
  const identities = await resolveIdentitiesBatch(
    shuffled.map((repo) => repo.did),
  );

  const items: DiscoveredBBS[] = [];
  for (const repo of shuffled) {
    if (!(repo.did in identities)) continue;
    try {
      const siteRecord = await getRecord(repo.did, SITE, "self");
      if (!isSiteRecord(siteRecord)) continue;
      items.push({
        did: repo.did,
        handle: identities[repo.did].handle,
        name: siteRecord.value.name || identities[repo.did].handle,
        description: siteRecord.value.description || "",
      });
    } catch {
      continue;
    }
  }

  const avatars = await getAvatars(items.map((item) => item.did));
  for (const item of items) {
    item.avatar = avatars[item.did];
  }

  return items;
}
