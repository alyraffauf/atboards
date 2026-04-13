/** Fetch discovered BBSes from the UFOs API, cached in memory. */

import { useEffect, useState } from "react";
import { TTLCache } from "../lib/cache";
import { resolveIdentitiesBatch } from "../lib/atproto";
import { SITE } from "../lib/lexicon";

interface UFORecord {
  did: string;
  record: { name?: string; description?: string };
}

export interface DiscoveredBBS {
  did: string;
  handle: string;
  name: string;
  description: string;
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
        const resp = await fetch(
          `https://ufos-api.microcosm.blue/records?collection=${SITE}&limit=50`,
        );
        let records = (await resp.json()) as UFORecord[];
        if (!records.length) return;
        records = records.sort(() => Math.random() - 0.5);
        const authors = await resolveIdentitiesBatch(
          records.map((record) => record.did),
        );
        const items: DiscoveredBBS[] = [];
        for (const record of records) {
          if (!(record.did in authors)) continue;
          items.push({
            did: record.did,
            handle: authors[record.did].handle,
            name: record.record.name || authors[record.did].handle,
            description: record.record.description || "",
          });
        }
        discoveryCache.set("all", items);
        setDiscovered(items);
      } catch {}
    })();
  }, []);

  return discovered;
}
