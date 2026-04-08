import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../lib/breadcrumb";
import {
  getRecordsBatch,
  resolveIdentitiesBatch,
  type ATRecord,
} from "../lib/atproto";
import { THREAD, REPLY } from "../lib/lexicon";
import {
  formatFullDate,
  makeAtUri,
  parseAtUri,
  relativeDate,
  useTitle,
} from "../lib/util";
import {
  createBan,
  createHide,
  createReply,
  deleteRecord,
  uploadAttachments,
} from "../lib/writes";
import type { BBSLoaderData, ThreadObj } from "../loaders";

interface LoaderData {
  handle: string;
  thread: ThreadObj;
  allRefs: { did: string; collection: string; rkey: string }[];
}

interface ReplyItem {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  pds: string;
  body: string;
  createdAt: string;
  quote: string | null;
  attachments: { file: { ref: { $link: string } }; name: string }[];
}

const PAGE_SIZE = 10;

export default function ThreadPage() {
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const loaded = useLoaderData() as LoaderData;
  const { handle, thread } = loaded;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Optimistic state — layered over loader refs without mirroring them into
  // component state (mirroring would loop with useLoaderData re-renders).
  const [optAdds, setOptAdds] = useState<
    { did: string; collection: string; rkey: string }[]
  >([]);
  const [optDels, setOptDels] = useState<Set<string>>(new Set());

  // Build a stable string key from loaded refs so identity churn from
  // useLoaderData doesn't retrigger downstream effects.
  const loadedKey = loaded.allRefs.map((r) => r.rkey).join("|");
  const refs = useMemo(() => {
    const base = loaded.allRefs.filter(
      (r) => !optDels.has(`at://${r.did}/${r.collection}/${r.rkey}`),
    );
    return [...base, ...optAdds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, optAdds, optDels]);

  const [page, setPage] = useState<number>(() => {
    const p = parseInt(params.get("page") ?? "1", 10);
    const focus = params.get("reply");
    if (focus) {
      for (let i = 0; i < loaded.allRefs.length; i++) {
        const r = loaded.allRefs[i];
        if (`at://${r.did}/${r.collection}/${r.rkey}` === focus) {
          return Math.floor(i / PAGE_SIZE) + 1;
        }
      }
    }
    const total = Math.max(1, Math.ceil(loaded.allRefs.length / PAGE_SIZE));
    return Math.max(1, Math.min(p, total));
  });

  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [optimistic, setOptimistic] = useState<Record<string, ReplyItem>>({});

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [quote, setQuote] = useState<{ uri: string; handle: string } | null>(null);
  const [posting, setPosting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(refs.length / PAGE_SIZE));

  useTitle(`${thread.title} — ${bbs.site.name}`);
  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${handle}` },
      ...(bbs.site.boards.find((b) => b.slug === thread.boardSlug)
        ? [
            {
              label: bbs.site.boards.find((b) => b.slug === thread.boardSlug)!
                .name,
              to: `/bbs/${handle}/board/${thread.boardSlug}`,
            },
          ]
        : []),
      { label: thread.title },
    ],
    [bbs, thread, handle],
  );

  const hydratePage = useCallback(
    async (currentRefs: typeof refs, p: number) => {
      setLoadingPage(true);
      const start = (p - 1) * PAGE_SIZE;
      const slice = currentRefs.slice(start, start + PAGE_SIZE);
      if (!slice.length) {
        setReplies([]);
        setLoadingPage(false);
        return;
      }
      const records = await getRecordsBatch(slice);
      const filtered = records.filter((r: ATRecord) => {
        const { did: d } = parseAtUri(r.uri);
        if (bbs.site.bannedDids.has(d)) return false;
        if (bbs.site.hiddenPosts.has(r.uri)) return false;
        return true;
      });
      const dids = filtered.map((r) => parseAtUri(r.uri).did);
      const authors = await resolveIdentitiesBatch(dids);
      const items: ReplyItem[] = filtered
        .filter((r) => parseAtUri(r.uri).did in authors)
        .map((r: ATRecord) => {
          const pp = parseAtUri(r.uri);
          const a = authors[pp.did];
          const v = r.value as any;
          return {
            uri: r.uri,
            did: pp.did,
            rkey: pp.rkey,
            handle: a.handle,
            pds: a.pds ?? "",
            body: v.body,
            createdAt: v.createdAt,
            quote: v.quote ?? null,
            attachments: v.attachments ?? [],
          };
        });

      // Merge in any pending optimistic replies that fall in this slice.
      const haveUris = new Set(items.map((i) => i.uri));
      const sliceUris = new Set(
        slice.map((s) => `at://${s.did}/${s.collection}/${s.rkey}`),
      );
      const stillPending: Record<string, ReplyItem> = {};
      for (const [uri, opt] of Object.entries(optimistic)) {
        if (haveUris.has(uri)) continue;
        if (sliceUris.has(uri)) items.push(opt);
        else stillPending[uri] = opt;
      }
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (Object.keys(stillPending).length !== Object.keys(optimistic).length) {
        setOptimistic(stillPending);
      }
      setReplies(items);
      setLoadingPage(false);
    },
    [bbs, optimistic],
  );

  // Key the hydration effect on length+page rather than the refs array
  // identity, so re-renders that don't actually change the ref set don't
  // re-fetch. The refs value used inside is fresh via closure.
  const refsLen = refs.length;
  useEffect(() => {
    hydratePage(refs, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsLen, page, loadedKey]);

  // Mirror page → ?page= so the URL reflects pagination and Back walks
  // through pages instead of leaving the thread.
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

  // Sync URL → page state for browser back/forward.
  const urlPage = parseInt(params.get("page") ?? "1", 10);
  useEffect(() => {
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPage]);

  const repliesByUri: Record<string, ReplyItem> = {};
  for (const r of replies) repliesByUri[r.uri] = r;

  const isSysop = user && user.did === bbs.identity.did;

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!agent || !user) return;
    setPosting(true);
    try {
      const threadUri = makeAtUri(thread.did, THREAD, thread.rkey);
      const attachments = await uploadAttachments(agent, files);
      const resp = await createReply(
        agent,
        threadUri,
        body.trim(),
        quote?.uri ?? null,
        attachments,
      );
      const newUri = resp.data.uri;
      const newRef = parseAtUri(newUri);
      const optItem: ReplyItem = {
        uri: newUri,
        did: newRef.did,
        rkey: newRef.rkey,
        handle: user.handle,
        pds: user.pdsUrl,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        quote: quote?.uri ?? null,
        attachments: (attachments as any) ?? [],
      };
      setOptimistic((prev) => ({ ...prev, [newUri]: optItem }));
      setOptAdds((prev) => [...prev, newRef]);
      const newTotal = Math.max(1, Math.ceil((refs.length + 1) / PAGE_SIZE));
      if (page === newTotal) {
        setReplies((prev) =>
          [...prev, optItem].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          ),
        );
      } else {
        setPage(newTotal);
      }
      setBody("");
      setFiles(null);
      setQuote(null);
    } catch {
      alert("Failed to post reply.");
    } finally {
      setPosting(false);
    }
  }

  async function onDeleteThread() {
    if (!agent) return;
    if (!confirm("Delete this thread?")) return;
    await deleteRecord(agent, THREAD, thread.rkey);
    navigate(`/bbs/${handle}`);
  }

  async function onDeleteReply(r: ReplyItem) {
    if (!agent) return;
    if (!confirm("Delete this reply?")) return;
    await deleteRecord(agent, REPLY, r.rkey);
    setOptDels((prev) => {
      const next = new Set(prev);
      next.add(r.uri);
      return next;
    });
  }

  async function onBan(banDid: string) {
    if (!agent) return;
    if (!confirm("Ban this user from your BBS?")) return;
    await createBan(agent, banDid);
    revalidator.revalidate();
  }

  async function onHide(uri: string) {
    if (!agent) return;
    if (!confirm("Hide this post?")) return;
    await createHide(agent, uri);
    revalidator.revalidate();
  }

  return (
    <>
      <article className="reply-card bg-neutral-900 border border-neutral-800 rounded p-4 mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-neutral-200">{thread.authorHandle}</span>
            <span className="text-neutral-600">·</span>
            <time
              className="text-xs text-neutral-500"
              title={formatFullDate(thread.createdAt)}
            >
              {relativeDate(thread.createdAt)}
            </time>
          </div>
          <span className="reply-actions flex items-center gap-3">
            {user && user.did === thread.did && (
              <button
                onClick={onDeleteThread}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                delete
              </button>
            )}
            {isSysop && user!.did !== thread.did && (
              <button
                onClick={() => onBan(thread.did)}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                ban
              </button>
            )}
            {isSysop && (
              <button
                onClick={() => onHide(thread.uri)}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                hide
              </button>
            )}
          </span>
        </div>
        <h1 className="text-base text-neutral-200 font-bold mb-3">
          {thread.title}
        </h1>
        <p className="text-neutral-400 whitespace-pre-wrap leading-relaxed">
          {thread.body}
        </p>
        {thread.attachments && thread.attachments.length > 0 && (
          <div className="mt-3 space-y-1">
            {thread.attachments.map((a, i) => (
              <a
                key={i}
                href={`${thread.authorPds}/xrpc/com.atproto.sync.getBlob?did=${thread.did}&cid=${a.file.ref.$link}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-500 hover:text-neutral-300 block"
              >
                [{a.name}]
              </a>
            ))}
          </div>
        )}
      </article>

      {totalPages > 1 && (
        <PageNav current={page} total={totalPages} onGo={setPage} />
      )}

      <div className="space-y-2 mt-4">
        {loadingPage ? (
          <p className="text-neutral-500">Loading replies...</p>
        ) : replies.length === 0 && !user ? (
          <p className="text-neutral-500">No replies yet.</p>
        ) : (
          replies.map((r) => (
            <ReplyCard
              key={r.uri}
              r={r}
              userDid={user?.did ?? ""}
              sysopDid={bbs.identity.did}
              quoted={r.quote ? repliesByUri[r.quote] : undefined}
              onQuote={() => setQuote({ uri: r.uri, handle: r.handle })}
              onDelete={() => onDeleteReply(r)}
              onBan={() => onBan(r.did)}
              onHide={() => onHide(r.uri)}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <PageNav current={page} total={totalPages} onGo={setPage} />
        </div>
      )}

      {user && (
        <form
          onSubmit={onReply}
          className="mt-6 border border-neutral-800 rounded p-4"
        >
          {quote && (
            <div className="text-xs text-neutral-500 mb-2">
              <span>quoting {quote.handle}</span>
              <button
                type="button"
                onClick={() => setQuote(null)}
                className="text-neutral-500 hover:text-red-400 ml-2"
              >
                x
              </button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply..."
            required
            rows={3}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-y mb-3"
          />
          <label className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer block mb-3">
            attach files
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(e.target.files)}
              className="hidden"
            />
            <span className="text-neutral-400 ml-2">
              {files && files.length
                ? Array.from(files)
                    .map((f) => f.name)
                    .join(", ")
                : ""}
            </span>
          </label>
          <button
            type="submit"
            disabled={posting}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
          >
            {posting ? "posting..." : "reply"}
          </button>
        </form>
      )}
    </>
  );
}

function ReplyCard({
  r,
  userDid,
  sysopDid,
  quoted,
  onQuote,
  onDelete,
  onBan,
  onHide,
}: {
  r: ReplyItem;
  userDid: string;
  sysopDid: string;
  quoted?: ReplyItem;
  onQuote: () => void;
  onDelete: () => void;
  onBan: () => void;
  onHide: () => void;
}) {
  return (
    <div className="reply-card border border-neutral-800/50 rounded p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-neutral-300">{r.handle}</span>
          <span className="text-neutral-600">·</span>
          <time
            className="text-xs text-neutral-500"
            title={formatFullDate(r.createdAt)}
          >
            {relativeDate(r.createdAt)}
          </time>
        </div>
        <span className="reply-actions flex items-center gap-3">
          {userDid && (
            <button
              onClick={onQuote}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              quote
            </button>
          )}
          {userDid === r.did && (
            <button
              onClick={onDelete}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              delete
            </button>
          )}
          {userDid === sysopDid && userDid !== r.did && (
            <button
              onClick={onBan}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              ban
            </button>
          )}
          {userDid === sysopDid && (
            <button
              onClick={onHide}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              hide
            </button>
          )}
        </span>
      </div>
      {quoted && (
        <div className="border-l-2 border-neutral-700 pl-3 mb-3 py-1 text-sm text-neutral-500">
          <span className="text-neutral-400">{quoted.handle}:</span>{" "}
          {quoted.body.substring(0, 200)}
          {quoted.body.length > 200 ? "..." : ""}
        </div>
      )}
      <p className="text-neutral-400 whitespace-pre-wrap leading-relaxed">
        {r.body}
      </p>
      {r.attachments.map((a, i) => (
        <a
          key={i}
          href={`${r.pds}/xrpc/com.atproto.sync.getBlob?did=${r.did}&cid=${a.file.ref.$link}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 hover:text-neutral-300 block mt-1"
        >
          [{a.name}]
        </a>
      ))}
    </div>
  );
}

function PageNav({
  current,
  total,
  onGo,
}: {
  current: number;
  total: number;
  onGo: (p: number) => void;
}) {
  const window = 2;
  let start = Math.max(1, current - window);
  let end = Math.min(total, current + window);
  if (end - start < 4) {
    if (start === 1) end = Math.min(total, start + 4);
    else if (end === total) start = Math.max(1, end - 4);
  }

  const btns: {
    key: string;
    label: string;
    page: number | null;
    active?: boolean;
  }[] = [];
  if (current > 1) btns.push({ key: "prev", label: "←", page: current - 1 });
  if (start > 1) {
    btns.push({ key: "1", label: "1", page: 1 });
    if (start > 2) btns.push({ key: "g1", label: "...", page: null });
  }
  for (let i = start; i <= end; i++) {
    btns.push({ key: `p${i}`, label: String(i), page: i, active: i === current });
  }
  if (end < total) {
    if (end < total - 1) btns.push({ key: "g2", label: "...", page: null });
    btns.push({ key: `last`, label: String(total), page: total });
  }
  if (current < total) btns.push({ key: "next", label: "→", page: current + 1 });

  return (
    <div className="flex items-center justify-center gap-2 text-sm w-full">
      {btns.map((b) =>
        b.active ? (
          <span
            key={b.key}
            className="text-neutral-200 bg-neutral-800 rounded px-3 py-1"
          >
            {b.label}
          </span>
        ) : b.page !== null ? (
          <button
            key={b.key}
            onClick={() => onGo(b.page!)}
            className="text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded px-3 py-1"
          >
            {b.label}
          </button>
        ) : (
          <span key={b.key} className="text-neutral-600 px-2 py-1">
            {b.label}
          </span>
        ),
      )}
    </div>
  );
}
