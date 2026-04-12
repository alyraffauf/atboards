/** Manages pagination, record fetching, and optimistic updates for a
 *  thread's reply list. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getRecordsBatch, resolveIdentitiesBatch } from "../lib/atproto";
import { parseAtUri } from "../lib/util";
import type { BBS } from "../lib/bbs";
import { is } from "@atcute/lexicons/validations";
import { mainSchema as replySchema } from "../lexicons/types/xyz/atboards/reply";
import type { XyzAtboardsReply } from "../lexicons";
import type { Reply } from "../components/ReplyCard";

const REPLIES_PER_PAGE = 10;

interface BacklinkRef {
  did: string;
  collection: string;
  rkey: string;
}

interface ThreadLoaderData {
  bbs: BBS;
  allRefs: BacklinkRef[];
}

function refToUri(ref: BacklinkRef): string {
  return `at://${ref.did}/${ref.collection}/${ref.rkey}`;
}

function pageForReply(
  refs: BacklinkRef[],
  replyUri: string | null,
): number | null {
  if (!replyUri) return null;
  const index = refs.findIndex((r) => refToUri(r) === replyUri);
  return index >= 0 ? Math.floor(index / REPLIES_PER_PAGE) + 1 : null;
}

function rkeyFromHash(): string | null {
  const h = typeof window !== "undefined" ? window.location.hash : "";
  return h.startsWith("#reply-") ? h.slice(7) : null;
}

function pageForRkey(refs: BacklinkRef[], rkey: string | null): number | null {
  if (!rkey) return null;
  const index = refs.findIndex((r) => r.rkey === rkey);
  return index >= 0 ? Math.floor(index / REPLIES_PER_PAGE) + 1 : null;
}

function clampPage(page: number, totalRefs: number): number {
  const totalPages = Math.max(1, Math.ceil(totalRefs / REPLIES_PER_PAGE));
  return Math.max(1, Math.min(page, totalPages));
}

// --- Hook ---

export function useThreadReplies(loaded: ThreadLoaderData) {
  const { bbs, allRefs } = loaded;
  const [params, setParams] = useSearchParams();

  // --- Optimistic state ---
  //
  // PDS writes land instantly but Constellation lags behind; track
  // in-flight mutations here so the UI stays responsive.

  const [pendingAdds, setPendingAdds] = useState<
    Record<string, { ref: BacklinkRef; item: Reply }>
  >({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Combine the loader's refs with our local overlay. The prune effect
  // below keeps pendingAdds from growing stale.
  const loaderFingerprint = allRefs.map((r) => r.rkey).join("|");

  const refs = useMemo(() => {
    const base = allRefs.filter((r) => !pendingDeletes.has(refToUri(r)));
    const adds = Object.values(pendingAdds).map((p) => p.ref);
    return [...base, ...adds];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on
    // loaderFingerprint (string) rather than allRefs (unstable reference)
  }, [loaderFingerprint, pendingAdds, pendingDeletes]);

  // When the loader refreshes and allRefs now includes a reply we added
  // optimistically, drop it from pendingAdds so the loader is the source
  // of truth going forward.
  useEffect(() => {
    setPendingAdds((prev) => {
      const loaderUris = new Set(allRefs.map(refToUri));
      let changed = false;
      const next: typeof prev = {};
      for (const [uri, entry] of Object.entries(prev)) {
        if (loaderUris.has(uri)) {
          changed = true;
        } else {
          next[uri] = entry;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reason
  }, [loaderFingerprint]);

  const totalPages = Math.max(1, Math.ceil(refs.length / REPLIES_PER_PAGE));

  // --- Pagination ---

  // Determine initial scroll target from ?reply= or #reply-
  const initialReplyParam = params.get("reply");
  const initialHashRkey = rkeyFromHash();
  const initialScrollRkey = initialReplyParam
    ? parseAtUri(initialReplyParam).rkey
    : initialHashRkey;

  const [page, setPage] = useState<number>(() => {
    const fromUrl = parseInt(params.get("page") ?? "1", 10);
    const fromReply = pageForReply(allRefs, initialReplyParam);
    const fromHash = pageForRkey(allRefs, initialHashRkey);
    return clampPage(fromHash ?? fromReply ?? fromUrl, allRefs.length);
  });

  const [initialScrollDone, setInitialScrollDone] =
    useState(!initialScrollRkey);

  // Keep the URL in sync when the user changes page (e.g. via PageNav).
  useEffect(() => {
    const urlPage = parseInt(params.get("page") ?? "1", 10);
    if (urlPage === page) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when
    // `page` changes, not when params object identity changes
  }, [page]);

  // Keep the page in sync when the user hits Back/Forward.
  const urlPage = parseInt(params.get("page") ?? "1", 10);
  useEffect(() => {
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPage]);

  // --- Hydration ---

  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

  // All replies we've ever seen — accumulates across page changes so quotes
  // and scroll targets always resolve, even for off-page replies.
  const [replyCache, setReplyCache] = useState<Record<string, Reply>>({});

  // Pending scroll target — set when navigating to a reply on another page.
  // Cleared once the scroll completes.
  const [pendingScrollRkey, setPendingScrollRkey] = useState<string | null>(
    null,
  );

  const fetchVisiblePage = useCallback(
    async (currentRefs: BacklinkRef[], currentPage: number) => {
      setLoading(true);

      const start = (currentPage - 1) * REPLIES_PER_PAGE;
      const slice = currentRefs.slice(start, start + REPLIES_PER_PAGE);

      if (!slice.length) {
        setReplies([]);
        setLoading(false);
        return;
      }

      // Fetch records from Slingshot.
      const records = await getRecordsBatch(slice);

      // Drop moderated and invalid content.
      const visible = records.filter((r) => {
        const { did } = parseAtUri(r.uri);
        return (
          !bbs.site.bannedDids.has(did) &&
          !bbs.site.hiddenPosts.has(r.uri) &&
          is(replySchema, r.value)
        );
      });

      // Resolve author handles.
      const dids = visible.map((r) => parseAtUri(r.uri).did);
      const authors = await resolveIdentitiesBatch(dids);

      // Build Reply objects.
      const items: Reply[] = visible
        .filter((r) => parseAtUri(r.uri).did in authors)
        .map((r) => {
          const { did, rkey } = parseAtUri(r.uri);
          const v = r.value as unknown as XyzAtboardsReply.Main;
          return {
            uri: r.uri,
            did,
            rkey,
            handle: authors[did].handle,
            pds: authors[did].pds ?? "",
            body: v.body,
            createdAt: v.createdAt,
            quote: v.quote ?? null,
            attachments: (v.attachments ?? []) as Reply["attachments"],
          };
        });

      // Merge in optimistic adds that Slingshot hasn't caught up to yet.
      const fetchedUris = new Set(items.map((i) => i.uri));
      const sliceUris = new Set(slice.map(refToUri));
      for (const [uri, pending] of Object.entries(pendingAdds)) {
        if (!fetchedUris.has(uri) && sliceUris.has(uri)) {
          items.push(pending.item);
        }
      }

      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setReplies(items);
      setLoading(false);

      // Add current page replies to the cache
      const newCache: Record<string, Reply> = {};
      for (const item of items) newCache[item.uri] = item;

      // Fetch any quoted replies not already known
      const missingQuotes = items
        .filter((i) => i.quote && !newCache[i.quote!])
        .map((i) => i.quote!)
        .filter((uri) => !replyCache[uri]);
      if (missingQuotes.length) {
        const quoteRefs = [...new Set(missingQuotes)].map((uri) =>
          parseAtUri(uri),
        );
        const quoteRecords = await getRecordsBatch(quoteRefs);
        const quoteDids = quoteRecords.map((r) => parseAtUri(r.uri).did);
        const quoteAuthors = await resolveIdentitiesBatch(quoteDids);
        for (const r of quoteRecords) {
          const { did, rkey } = parseAtUri(r.uri);
          if (!(did in quoteAuthors)) continue;
          if (!is(replySchema, r.value)) continue;
          const v = r.value as unknown as XyzAtboardsReply.Main;
          newCache[r.uri] = {
            uri: r.uri,
            did,
            rkey,
            handle: quoteAuthors[did].handle,
            pds: quoteAuthors[did].pds ?? "",
            body: v.body,
            createdAt: v.createdAt,
            quote: v.quote ?? null,
            attachments: (v.attachments ?? []) as Reply["attachments"],
          };
        }
      }

      setReplyCache((prev) => ({ ...prev, ...newCache }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingAdds
    // is included so the merge step always sees the latest optimistic set
    [bbs, pendingAdds],
  );

  // Re-fetch whenever the visible page or the underlying ref list changes.
  const refsLength = refs.length;
  useEffect(() => {
    fetchVisiblePage(refs, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on
    // stable scalars, not the refs array reference or callback identity
  }, [refsLength, page, loaderFingerprint]);

  // Scroll to a reply after a cross-page navigation completes.
  useEffect(() => {
    if (!pendingScrollRkey) return;
    const id = `reply-${pendingScrollRkey}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setPendingScrollRkey(null);
    }
  }, [pendingScrollRkey, replies]);

  // Scroll to the initial target after the first load.
  useEffect(() => {
    if (initialScrollDone || loading || !initialScrollRkey) return;
    setInitialScrollDone(true);
    const el = document.getElementById(`reply-${initialScrollRkey}`);
    if (el) {
      el.scrollIntoView({ behavior: "instant" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, replies]);

  // --- Public actions ---

  const addOptimisticReply = useCallback(
    (item: Reply) => {
      const ref = parseAtUri(item.uri);
      setPendingAdds((prev) => ({ ...prev, [item.uri]: { ref, item } }));

      const newTotalPages = Math.max(
        1,
        Math.ceil((refs.length + 1) / REPLIES_PER_PAGE),
      );
      if (page === newTotalPages) {
        // Already on the last page — just append.
        setReplies((prev) =>
          [...prev, item].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          ),
        );
      } else {
        // Jump to the (new) last page so the reply is visible.
        setPage(newTotalPages);
      }
    },
    [refs.length, page],
  );

  const removeReply = useCallback((uri: string) => {
    setPendingDeletes((prev) => new Set(prev).add(uri));
    setReplies((prev) => prev.filter((r) => r.uri !== uri));
  }, []);

  const scrollToReply = useCallback(
    (uri: string) => {
      const { rkey } = parseAtUri(uri);
      // If already on screen, just scroll
      const el = document.getElementById(`reply-${rkey}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
      // Find the page and navigate — the effect will scroll once loaded
      const idx = refs.findIndex((r) => refToUri(r) === uri);
      if (idx >= 0) {
        const targetPage = Math.floor(idx / REPLIES_PER_PAGE) + 1;
        setPendingScrollRkey(rkey);
        setPage(targetPage);
      }
    },
    [refs],
  );

  return {
    page,
    setPage,
    totalPages,
    replies,
    loading,
    refs,
    replyCache,
    scrollToReply,
    addOptimisticReply,
    removeReply,
  };
}
