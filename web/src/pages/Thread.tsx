import { useState, type SyntheticEvent } from "react";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { useThreadReplies } from "../hooks/useThreadReplies";
import { BOARD, POST } from "../lib/lexicon";
import { makeAtUri, parseAtUri } from "../lib/util";
import * as limits from "../lib/limits";
import {
  createBan,
  createHide,
  createPost,
  deleteRecord,
  uploadAttachments,
} from "../lib/writes";
import type { BBSLoaderData, ThreadObj } from "../router/loaders";
import PageNav from "../components/nav/PageNav";
import ReplyCard, { type Reply } from "../components/post/ReplyCard";
import ComposeForm from "../components/form/ComposeForm";
import ThreadCard from "../components/post/ThreadCard";

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
    replyCache,
    scrollToReply,
    addOptimisticReply,
    removeReply,
  } = useThreadReplies(loaded);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyingTo, setReplyingTo] = useState<{
    uri: string;
    handle: string;
  } | null>(null);
  const [posting, setPosting] = useState(false);

  usePageTitle(`${thread.title} — ${bbs.site.name}`);
  useBreadcrumb(buildBreadcrumb(bbs, thread, handle), [bbs, thread, handle]);

  const isSysop = user && user.did === bbs.identity.did;

  async function onReply(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent || !user) return;
    setPosting(true);
    try {
      const threadUri = makeAtUri(thread.did, POST, thread.rkey);
      const attachments = await uploadAttachments(agent, files);
      const boardUri = makeAtUri(bbs.identity.did, BOARD, thread.boardSlug);
      const resp = await createPost(agent, boardUri, body.trim(), {
        root: threadUri,
        parent: replyingTo?.uri ?? undefined,
        attachments,
      });
      addOptimisticReply({
        uri: resp.data.uri,
        did: parseAtUri(resp.data.uri).did,
        rkey: parseAtUri(resp.data.uri).rkey,
        handle: user.handle,
        pds: user.pdsUrl,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        parent: replyingTo?.uri ?? null,
        attachments: attachments as Reply["attachments"],
      });
      setBody("");
      setFiles([]);
      setReplyingTo(null);
    } catch {
      alert("Could not post reply.");
    } finally {
      setPosting(false);
    }
  }

  async function onDeleteThread() {
    if (!agent) return;
    if (!confirm("Delete this thread?")) return;
    await deleteRecord(agent, POST, thread.rkey);
    navigate(`/bbs/${handle}`);
  }

  async function onDeleteReply(reply: Reply) {
    if (!agent) return;
    if (!confirm("Delete this reply?")) return;
    try {
      await deleteRecord(agent, POST, reply.rkey);
    } catch (e: unknown) {
      console.error("deleteRecord failed:", e);
      alert(`Could not delete: ${e instanceof Error ? e.message : e}`);
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
      <ThreadCard
        thread={thread}
        userDid={user?.did}
        sysopDid={bbs.identity.did}
        onDelete={onDeleteThread}
        onBan={() => onBan(thread.did)}
        onHide={() => onHide(thread.uri)}
      />

      {totalPages > 1 && (
        <PageNav current={page} total={totalPages} onGo={setPage} />
      )}

      <div className="space-y-2 mt-4">
        {loadingPage ? (
          <p className="text-neutral-400">loading...</p>
        ) : replies.length === 0 && !user ? (
          <p className="text-neutral-400">No replies yet.</p>
        ) : (
          replies.map((reply) => (
            <ReplyCard
              key={reply.uri}
              reply={reply}
              userDid={user?.did ?? ""}
              sysopDid={bbs.identity.did}
              parentPost={
                reply.parent ? replyCache[reply.parent] : undefined
              }
              onReplyTo={() =>
                setReplyingTo({ uri: reply.uri, handle: reply.handle })
              }
              onParentClick={
                reply.parent
                  ? () => scrollToReply(reply.parent!)
                  : undefined
              }
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
        <ComposeForm
          className="mt-6 border border-neutral-800 rounded p-4"
          onSubmit={onReply}
          body={body}
          onBodyChange={setBody}
          bodyPlaceholder="Write a reply..."
          bodyRows={3}
          bodyMaxLength={limits.POST_BODY}
          files={files}
          onFilesChange={setFiles}
          replyingTo={replyingTo}
          onClearReplyTo={() => setReplyingTo(null)}
          submitLabel="reply"
          posting={posting}
        />
      )}
    </>
  );
}

function buildBreadcrumb(
  bbs: BBSLoaderData["bbs"],
  thread: ThreadObj,
  handle: string,
) {
  const board = bbs.site.boards.find(
    (board) => board.slug === thread.boardSlug,
  );
  return [
    { label: bbs.site.name, to: `/bbs/${handle}` },
    ...(board
      ? [{ label: board.name, to: `/bbs/${handle}/board/${board.slug}` }]
      : []),
    { label: thread.title },
  ];
}
