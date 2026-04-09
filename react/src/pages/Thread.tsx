import { useState, type FormEvent } from "react";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { useTitle } from "../hooks/useTitle";
import { useThreadReplies } from "../hooks/useThreadReplies";
import { THREAD, REPLY } from "../lib/lexicon";
import {
  formatFullDate,
  makeAtUri,
  parseAtUri,
  relativeDate,
} from "../lib/util";
import {
  createBan,
  createHide,
  createReply,
  deleteRecord,
  uploadAttachments,
} from "../lib/writes";
import type { BBSLoaderData, ThreadObj } from "../router/loaders";
import PageNav from "../components/PageNav";
import ReplyCard, { type Reply } from "../components/ReplyCard";

interface LoaderData {
  handle: string;
  bbs: BBSLoaderData["bbs"];
  thread: ThreadObj;
  allRefs: { did: string; collection: string; rkey: string }[];
}

/**
 * Outer wrapper: re-keys the inner page on thread URI so navigating between
 * threads gives us a fresh component instance (and fresh hook state). Without
 * this, react-router reuses the same Thread component on param change and
 * state from the previous thread (page index, optimistic adds) bleeds in.
 */
export default function ThreadRoute() {
  const loaded = useLoaderData() as LoaderData;
  return <ThreadPage key={loaded.thread.uri} loaded={loaded} />;
}

function ThreadPage({ loaded }: { loaded: LoaderData }) {
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { handle, thread } = loaded;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const {
    page,
    setPage,
    totalPages,
    replies,
    loading: loadingPage,
    refs,
    addOptimisticReply,
    removeReply,
  } = useThreadReplies(loaded);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [quote, setQuote] = useState<{ uri: string; handle: string } | null>(
    null,
  );
  const [posting, setPosting] = useState(false);

  useTitle(`${thread.title} — ${bbs.site.name}`);
  useBreadcrumb(
    buildBreadcrumb(bbs, thread, handle),
    [bbs, thread, handle],
  );

  const isSysop = user && user.did === bbs.identity.did;
  const repliesByUri: Record<string, Reply> = {};
  for (const r of replies) repliesByUri[r.uri] = r;

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
      addOptimisticReply({
        uri: resp.data.uri,
        did: parseAtUri(resp.data.uri).did,
        rkey: parseAtUri(resp.data.uri).rkey,
        handle: user.handle,
        pds: user.pdsUrl,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        quote: quote?.uri ?? null,
        attachments: attachments as Reply["attachments"],
      });
      setBody("");
      setFiles(null);
      setQuote(null);
      // Give Constellation a moment to index the new reply, then refresh
      // the loader so allRefs catches up and the optimistic entry can
      // gracefully retire.
      setTimeout(() => revalidator.revalidate(), 1500);
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

  async function onDeleteReply(reply: Reply) {
    if (!agent) return;
    if (!confirm("Delete this reply?")) return;
    try {
      await deleteRecord(agent, REPLY, reply.rkey);
    } catch (e: any) {
      console.error("deleteRecord failed:", e);
      alert(`Failed to delete: ${e?.message ?? e}`);
      return;
    }
    removeReply(reply.uri);
    revalidator.revalidate();
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
      <ThreadHeader
        thread={thread}
        userDid={user?.did}
        sysopDid={bbs.identity.did}
        onDeleteThread={onDeleteThread}
        onBanAuthor={() => onBan(thread.did)}
        onHideThread={() => onHide(thread.uri)}
      />

      {totalPages > 1 && (
        <PageNav current={page} total={totalPages} onGo={setPage} />
      )}

      <div className="space-y-2 mt-4">
        {loadingPage ? (
          <p className="text-neutral-500">Loading replies...</p>
        ) : replies.length === 0 && !user ? (
          <p className="text-neutral-500">No replies yet.</p>
        ) : (
          replies.map((reply) => (
            <ReplyCard
              key={reply.uri}
              reply={reply}
              userDid={user?.did ?? ""}
              sysopDid={bbs.identity.did}
              quoted={reply.quote ? repliesByUri[reply.quote] : undefined}
              onQuote={() => setQuote({ uri: reply.uri, handle: reply.handle })}
              onDelete={() => onDeleteReply(reply)}
              onBan={() => onBan(reply.did)}
              onHide={() => onHide(reply.uri)}
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
        <ReplyForm
          body={body}
          onBodyChange={setBody}
          files={files}
          onFilesChange={setFiles}
          quote={quote}
          onClearQuote={() => setQuote(null)}
          posting={posting}
          onSubmit={onReply}
        />
      )}
    </>
  );
}

// --- Sub-views ---

function buildBreadcrumb(
  bbs: BBSLoaderData["bbs"],
  thread: ThreadObj,
  handle: string,
) {
  const board = bbs.site.boards.find((b) => b.slug === thread.boardSlug);
  return [
    { label: bbs.site.name, to: `/bbs/${handle}` },
    ...(board
      ? [{ label: board.name, to: `/bbs/${handle}/board/${board.slug}` }]
      : []),
    { label: thread.title },
  ];
}

function ThreadHeader({
  thread,
  userDid,
  sysopDid,
  onDeleteThread,
  onBanAuthor,
  onHideThread,
}: {
  thread: ThreadObj;
  userDid?: string;
  sysopDid: string;
  onDeleteThread: () => void;
  onBanAuthor: () => void;
  onHideThread: () => void;
}) {
  const isAuthor = userDid && userDid === thread.did;
  const isSysop = userDid && userDid === sysopDid;
  return (
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
          {isAuthor && (
            <button
              onClick={onDeleteThread}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              delete
            </button>
          )}
          {isSysop && !isAuthor && (
            <button
              onClick={onBanAuthor}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              ban
            </button>
          )}
          {isSysop && (
            <button
              onClick={onHideThread}
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
  );
}

function ReplyForm({
  body,
  onBodyChange,
  files,
  onFilesChange,
  quote,
  onClearQuote,
  posting,
  onSubmit,
}: {
  body: string;
  onBodyChange: (s: string) => void;
  files: FileList | null;
  onFilesChange: (f: FileList | null) => void;
  quote: { uri: string; handle: string } | null;
  onClearQuote: () => void;
  posting: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 border border-neutral-800 rounded p-4"
    >
      {quote && (
        <div className="text-xs text-neutral-500 mb-2">
          <span>quoting {quote.handle}</span>
          <button
            type="button"
            onClick={onClearQuote}
            className="text-neutral-500 hover:text-red-400 ml-2"
          >
            x
          </button>
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
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
          onChange={(e) => onFilesChange(e.target.files)}
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
  );
}

