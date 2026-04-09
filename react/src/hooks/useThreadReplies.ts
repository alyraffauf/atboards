/**
 * State machine for the thread page's reply list.
 *
 * Owns three concerns that are awkward to mix in the page component:
 *
 *   - **Pagination.** A page index synced bidirectionally with `?page=` so
 *     browser back/forward walks pages.
 *
 *   - **Hydration.** Slingshot reads for the visible page only — not all 1000
 *     refs at once.
 *
 *   - **Optimistic updates.** New replies show up immediately even if
 *     Slingshot/Constellation hasn't indexed them yet, and deleted replies
 *     vanish without waiting for a loader revalidation.
 *
 * Returns a stable surface the page renders without knowing any of this:
 *
 *     const { page, setPage, totalPages, replies, loading,
 *             addOptimisticReply, removeReply } = useThreadReplies(loaded);
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getRecordsBatch,
  resolveIdentitiesBatch,
} from "../lib/atproto";
import type { BBS } from "../lib/bbs";
import { parseAtUri } from "../lib/util";
import type { XyzAtboardsReply } from "../lexicons";
import type { Reply } from "../components/ReplyCard";

export const REPLIES_PER_PAGE = 10;

interface BacklinkRef {
  did: string;
  collection: string;
  rkey: string;
}

interface ThreadLoaderShape {
  bbs: BBS;
  allRefs: BacklinkRef[];
}

function refToUri(ref: BacklinkRef): string {
  return `at://${ref.did}/${ref.collection}/${ref.rkey}`;
}

function findFocusPage(refs: BacklinkRef[], focusUri: string | null): number | null {
  if (!focusUri) return null;
  for (let i = 0; i < refs.length; i++) {
    if (refToUri(refs[i]) === focusUri) {
      return Math.floor(i / REPLIES_PER_PAGE) + 1;
    }
  }
  return null;
}

export function useThreadReplies(loaded: ThreadLoaderShape) {
  const { bbs, allRefs } = loaded;
  const [params, setParams] = useSearchParams();

  // Optimistic overlay: new replies pending indexing, and deletions pending
  // a loader revalidation. Both keyed by uri so dedupe is trivial.
  const [pendingAdds, setPendingAdds] = useState<
    Record<string, { ref: BacklinkRef; item: Reply }>
  >({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Layer the overlays on top of the loader's refs. Prune-effect below
  // guarantees pendingAdds never contains a uri that allRefs already has,
  // so concatenation is safe (no dupes).
  const loadedKey = allRefs.map((r) => r.rkey).join("|");
  const refs = useMemo(() => {
    const base = allRefs.filter((r) => !pendingDeletes.has(refToUri(r)));
    const adds = Object.values(pendingAdds).map((p) => p.ref);
    return [...base, ...adds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, pendingAdds, pendingDeletes]);

  // Once the loader has caught up (allRefs contains an optimistic uri), drop
  // it from pendingAdds. Done in its own effect rather than inside hydrate
  // so the merge logic is purely a display concern.
  useEffect(() => {
    setPendingAdds((prev) => {
      const knownUris = new Set(allRefs.map(refToUri));
      let changed = false;
      const next: typeof prev = {};
      for (const [uri, pending] of Object.entries(prev)) {
        if (knownUris.has(uri)) {
          changed = true;
          continue;
        }
        next[uri] = pending;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const totalPages = Math.max(1, Math.ceil(refs.length / REPLIES_PER_PAGE));

  // Initial page: honor ?page= or ?reply= focus, clamped.
  const [page, setPage] = useState<number>(() => {
    const fromUrl = parseInt(params.get("page") ?? "1", 10);
    const focused = findFocusPage(allRefs, params.get("reply"));
    const initial = focused ?? fromUrl;
    const total = Math.max(1, Math.ceil(allRefs.length / REPLIES_PER_PAGE));
    return Math.max(1, Math.min(initial, total));
  });

  // page → URL (for shareable links + browser history)
  useEffect(() => {
    const cur = parseInt(params.get("page") ?? "1", 10);
    if (cur === page) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // URL → page (for browser back/forward)
  const urlPage = parseInt(params.get("page") ?? "1", 10);
  useEffect(() => {
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPage]);

  // Hydrate the visible slice.
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(
    async (currentRefs: BacklinkRef[], p: number) => {
      setLoading(true);
      const start = (p - 1) * REPLIES_PER_PAGE;
      const slice = currentRefs.slice(start, start + REPLIES_PER_PAGE);
      if (!slice.length) {
        setReplies([]);
        setLoading(false);
        return;
      }

      const records = await getRecordsBatch(slice);
      const visible = records.filter((r) => {
        const { did } = parseAtUri(r.uri);
        if (bbs.site.bannedDids.has(did)) return false;
        if (bbs.site.hiddenPosts.has(r.uri)) return false;
        return true;
      });

      const dids = visible.map((r) => parseAtUri(r.uri).did);
      const authors = await resolveIdentitiesBatch(dids);

      const items: Reply[] = visible
        .filter((r) => parseAtUri(r.uri).did in authors)
        .map((r) => {
          const { did, rkey } = parseAtUri(r.uri);
          const author = authors[did];
          const v = r.value as unknown as XyzAtboardsReply.Main;
          return {
            uri: r.uri,
            did,
            rkey,
            handle: author.handle,
            pds: author.pds ?? "",
            body: v.body,
            createdAt: v.createdAt,
            quote: v.quote ?? null,
            attachments: (v.attachments ?? []) as Reply["attachments"],
          };
        });

      // For any optimistic add whose ref lands in this page, display it if
      // upstream hasn't returned the record yet. Pruning pendingAdds is the
      // loader-watch effect's job — we only handle display here.
      const haveUris = new Set(items.map((i) => i.uri));
      const sliceUris = new Set(slice.map(refToUri));
      for (const [uri, pending] of Object.entries(pendingAdds)) {
        if (haveUris.has(uri)) continue;
        if (sliceUris.has(uri)) items.push(pending.item);
      }
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      setReplies(items);
      setLoading(false);
    },
    // pendingAdds is captured deliberately so the merge sees the latest set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bbs, pendingAdds],
  );

  // Re-hydrate when ref count or page changes (but not on every render).
  const refsLength = refs.length;
  useEffect(() => {
    hydrate(refs, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsLength, page, loadedKey]);

  /** Push an optimistic new reply, navigate to its page, and append immediately. */
  const addOptimisticReply = useCallback(
    (item: Reply) => {
      const ref = parseAtUri(item.uri);
      setPendingAdds((prev) => ({ ...prev, [item.uri]: { ref, item } }));
      const newTotal = Math.max(
        1,
        Math.ceil((refs.length + 1) / REPLIES_PER_PAGE),
      );
      if (page === newTotal) {
        setReplies((prev) =>
          [...prev, item].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          ),
        );
      } else {
        setPage(newTotal);
      }
    },
    [refs.length, page],
  );

  /** Mark a reply as deleted: hide it locally and remember to skip it. */
  const removeReply = useCallback((uri: string) => {
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.add(uri);
      return next;
    });
    setReplies((prev) => prev.filter((r) => r.uri !== uri));
  }, []);

  return {
    page,
    setPage,
    totalPages,
    replies,
    loading,
    refs,
    addOptimisticReply,
    removeReply,
  };
}
