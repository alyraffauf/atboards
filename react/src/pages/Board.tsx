import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import {
  getBacklinks,
  getRecordsBatch,
  resolveIdentitiesBatch,
  type ATRecord,
} from "../lib/atproto";
import { BOARD, THREAD } from "../lib/lexicon";
import { makeAtUri, parseAtUri, relativeDate } from "../lib/util";
import { useTitle } from "../hooks/useTitle";
import { createThread, uploadAttachments } from "../lib/writes";
import type { BBSLoaderData, ThreadItem } from "../router/loaders";
import type { Board as BoardType } from "../lib/bbs";

interface LoaderData {
  handle: string;
  board: BoardType;
  threads: ThreadItem[];
  cursor: string | null;
}

export default function BoardPage() {
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const loaded = useLoaderData() as LoaderData;
  const { handle, board } = loaded;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  // Threads beyond the loader's first page are appended client-side.
  const [extraThreads, setExtraThreads] = useState<ThreadItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(loaded.cursor);
  const [loadingMore, setLoadingMore] = useState(false);
  // Reset paging state whenever the loader hands us a fresh first page.
  useEffect(() => {
    setExtraThreads([]);
    setCursor(loaded.cursor);
  }, [loaded.threads, loaded.cursor]);
  const threads = [...loaded.threads, ...extraThreads];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  useTitle(`${board.name} — ${bbs.site.name}`);
  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${handle}` },
      { label: board.name, to: `/bbs/${handle}/board/${board.slug}` },
    ],
    [bbs, board, handle],
  );

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const boardUri = makeAtUri(bbs.identity.did, BOARD, board.slug);
      const bl = await getBacklinks(boardUri, `${THREAD}:board`, 50, cursor);
      const recs = await getRecordsBatch(bl.records);
      const filtered = recs.filter((r) => {
        const { did } = parseAtUri(r.uri);
        if (bbs.site.bannedDids.has(did)) return false;
        if (bbs.site.hiddenPosts.has(r.uri)) return false;
        return true;
      });
      const dids = filtered.map((r) => parseAtUri(r.uri).did);
      const authors = await resolveIdentitiesBatch(dids);
      const items: ThreadItem[] = filtered
        .filter((r) => parseAtUri(r.uri).did in authors)
        .map((r: ATRecord) => {
          const p = parseAtUri(r.uri);
          const v = r.value as any;
          return {
            uri: r.uri,
            did: p.did,
            rkey: p.rkey,
            handle: authors[p.did].handle,
            title: v.title,
            body: v.body,
            createdAt: v.createdAt,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setExtraThreads((prev) => [...prev, ...items]);
      setCursor(bl.cursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!agent || !user) {
      alert("Not signed in.");
      return;
    }
    try {
      const boardUri = makeAtUri(bbs.identity.did, BOARD, board.slug);
      const attachments = await uploadAttachments(agent, files);
      const resp = await createThread(
        agent,
        boardUri,
        title.trim(),
        body.trim(),
        attachments,
      );
      setTitle("");
      setBody("");
      setFiles(null);
      // Trigger a board revalidation in the background so the new thread
      // appears in the list once Constellation indexes it.
      setTimeout(() => revalidator.revalidate(), 1500);
      // Navigate the user straight into their freshly created thread —
      // Slingshot has the record immediately even if Constellation lags.
      const { did, rkey } = parseAtUri(resp.data.uri);
      navigate(`/bbs/${handle}/thread/${did}/${rkey}`);
    } catch (err: any) {
      console.error("createThread failed:", err);
      alert(`Failed to post: ${err?.message ?? err}`);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg text-neutral-200 mb-1">{board.name}</h1>
        <p className="text-neutral-500">{board.description}</p>
      </div>

      {user && (
        <details className="mb-6 border border-neutral-800 rounded p-4">
          <summary className="text-neutral-300 cursor-pointer">new thread</summary>
          <form onSubmit={onCreate} className="mt-4 space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Thread title"
              required
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              required
              rows={4}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-y"
            />
            <label className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer block">
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
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
            >
              post
            </button>
          </form>
        </details>
      )}

      <div>
        {threads.length ? (
          threads.map((t) => (
            <Link
              key={t.uri}
              to={`/bbs/${handle}/thread/${t.did}/${t.rkey}`}
              className="flex items-baseline justify-between gap-4 px-3 py-2.5 -mx-3 rounded hover:bg-neutral-900 group"
            >
              <span className="text-neutral-300 group-hover:text-white truncate">
                {t.title}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {t.handle} · {relativeDate(t.createdAt)}
              </span>
            </Link>
          ))
        ) : (
          <p className="text-neutral-500">No threads yet.</p>
        )}
      </div>
      {cursor && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-neutral-500 hover:text-neutral-300"
          >
            {loadingMore ? "loading…" : "next page →"}
          </button>
        </div>
      )}
    </>
  );
}
