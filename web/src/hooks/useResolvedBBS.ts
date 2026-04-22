/** Debounced BBS resolution — resolves a handle to a BBS name if one exists. */

import { useEffect, useState } from "react";
import { resolveIdentity, getRecord, getAvatar } from "../lib/atproto";
import { SITE } from "../lib/lexicon";
import type { Suggestion } from "../components/dashboard/DialBBS";

const DEBOUNCE_MS = 300;

export function useResolvedBBS(query: string): Suggestion | null {
  const [result, setResult] = useState<Suggestion | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !trimmed.includes(".")) {
      setResult(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const identity = await resolveIdentity(trimmed);
        const [siteRecord, avatar] = await Promise.all([
          getRecord(identity.did, SITE, "self"),
          getAvatar(identity.did),
        ]);
        const siteValue = siteRecord.value as { name?: string };
        if (!cancelled) {
          setResult({
            to: `/bbs/${encodeURIComponent(identity.handle)}`,
            name: siteValue.name ?? identity.handle,
            handle: identity.handle,
            avatar,
          });
        }
      } catch {
        if (!cancelled) setResult(null);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return result;
}
