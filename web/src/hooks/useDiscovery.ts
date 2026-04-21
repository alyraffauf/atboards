/** Fetch discovered BBSes from the Lightrail API, cached in memory. */

import { useEffect, useState } from "react";
import { TTLCache } from "../lib/cache";
import { getAvatars, getRecord, resolveIdentitiesBatch } from "../lib/atproto";
import { SITE } from "../lib/lexicon";
import { SERVICES } from "../lib/shared";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as siteSchema } from "../lexicons/types/xyz/atbbs/site";
import type { XyzAtbbsSite } from "../lexicons";

interface LightrailRepo {
  did: string;
}

export interface DiscoveredBBS {
  did: string;
  handle: string;
  name: string;
  description: string;
  avatar?: string;
}

const discoveryCache = new TTLCache<string, DiscoveredBBS[]>(5 * 60 * 1000);

export function useDiscovery(): DiscoveredBBS[] {
  const [discovered, setDiscovered] = useState<DiscoveredBBS[]>([]);

  useEffect(() => {
    const cached = discoveryCache.get("all");
    if (cached) {
      setDiscovered(cached);
      return;
    }
    (async () => {
      try {
        const response = await fetch(
          `${SERVICES.lightrail}/com.atproto.sync.listReposByCollection?collection=${SITE}&limit=50`,
        );
        const data = (await response.json()) as { repos: LightrailRepo[] };
        if (!data.repos.length) return;

        const shuffled = data.repos.sort(() => Math.random() - 0.5);
        const identities = await resolveIdentitiesBatch(
          shuffled.map((repo) => repo.did),
        );

        const items: DiscoveredBBS[] = [];
        for (const repo of shuffled) {
          if (!(repo.did in identities)) continue;
          try {
            const siteRecord = await getRecord(repo.did, SITE, "self");
            if (!is(siteSchema, siteRecord.value)) continue;
            const siteValue = siteRecord.value as unknown as XyzAtbbsSite.Main;
            items.push({
              did: repo.did,
              handle: identities[repo.did].handle,
              name: siteValue.name || identities[repo.did].handle,
              description: siteValue.description || "",
            });
          } catch {
            continue;
          }
        }

        const avatars = await getAvatars(items.map((item) => item.did));
        for (const item of items) {
          item.avatar = avatars[item.did];
        }

        discoveryCache.set("all", items);
        setDiscovered(items);
      } catch {}
    })();
  }, []);

  return discovered;
}
