import { useState, type SyntheticEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { useThreadReplies } from "../hooks/useThreadReplies";
import { BAN, BOARD, HIDE, POST } from "../lib/lexicon";
import { makeAtUri, nowIso, parseAtUri } from "../lib/util";
import * as limits from "../lib/limits";
import {
  createBan,
  createHide,
  createPost,
  deleteRecord,
  uploadAttachments,
} from "../lib/writes";
import {
  bbsModerationQuery,
  bbsQuery,
  myThreadsQuery,
  threadPageQuery,
  threadRefsQuery,
  threadRootQuery,
} from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { threadUriFor } from "../lib/thread";
import { REPLIES_PER_PAGE, refToUri } from "../lib/replies";
import { invalidateAllBBSCaches } from "../lib/bbs";
import type { BacklinkRef } from "../lib/atproto";
import type { ReplyPage } from "../lib/thread";
import type { BBS } from "../lib/bbs";
import PageNav from "../components/nav/PageNav";
import ReplyCard, { type Reply } from "../components/post/ReplyCard";
import ComposeForm from "../components/form/ComposeForm";
import ThreadCard from "../components/post/ThreadCard";

export default function ThreadPage() {
  const { handle, did, tid } = useParams();
  const threadUri = threadUriFor(did!, tid!);
  const { user, agent } = useAuth();
  const navigate = useNavigate();

  const { data: bbs } = useSuspenseQuery(bbsQuery(handle!));
  const { data: thread } = useSuspenseQuery(threadRootQuery(did!, tid!));
  const { data: moderation } = useSuspenseQuery(
    bbsModerationQuery(bbs.identity.pds ?? "", bbs.identity.did),
  );
  const {
    page,
    setPage,
    totalPages,
    refs,
    replies,
    parentReplies,
    scrollToReply,
  } = useThreadReplies(threadUri);

  const isSysop = !!(user && user.did === bbs.identity.did);
  const threadHidden =
    !isSysop &&
    (moderation.bannedDids.has(thread.did) ||
      moderation.hiddenUris.has(thread.uri));
  const visibleReplies = isSysop
    ? replies
    : replies.filter(
        (reply) =>
          !moderation.bannedDids.has(reply.did) &&
          !moderation.hiddenUris.has(reply.uri),
      );

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyingTo, setReplyingTo] = useState<{
    uri: string;
    handle: string;
  } | null>(null);

  usePageTitle(`${thread.title} — ${bbs.site.name}`);
  useBreadcrumb(buildBreadcrumb(bbs, thread.title, thread.boardSlug, handle!), [
    bbs,
    thread,
    handle,
  ]);

  // --- Mutations ---

  const createReplyMutation = useMutation({
    mutationFn: async (input: {
      body: string;
      parent: string | null;
      files: File[];
    }) => {
      if (!agent || !user) throw new Error("Not signed in");
      const boardUri = makeAtUri(bbs.identity.did, BOARD, thread.boardSlug);
      const attachments = await uploadAttachments(agent, input.files);
      const resp = await createPost(agent, boardUri, input.body, {
        root: threadUri,
        parent: input.parent ?? undefined,
        attachments,
      });
      return { resp, input, attachments };
    },
    onSuccess: ({ resp, input, attachments }) => {
      if (!user) return;
      const { did: newDid, rkey: newRkey } = parseAtUri(resp.data.uri);
      const newRef: BacklinkRef = {
        did: newDid,
        collection: POST,
        rkey: newRkey,
      };
      const newReply: Reply = {
        uri: resp.data.uri,
        did: newDid,
        rkey: newRkey,
        handle: user.handle,
        pds: user.pdsUrl,
        body: input.body,
        createdAt: nowIso(),
        parent: input.parent,
        attachments: attachments as Reply["attachments"],
      };

      const updatedRefs = appendRefAndReply(threadUri, newRef, newReply);

      setBody("");
      setFiles([]);
      setReplyingTo(null);

      const newLastPage = Math.max(
        1,
        Math.ceil(updatedRefs.length / REPLIES_PER_PAGE),
      );
      if (page !== newLastPage) setPage(newLastPage);
    },
    onError: (err) =>
      alert(
        `Could not post reply: ${err instanceof Error ? err.message : err}`,
      ),
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (reply: Reply) => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, POST, reply.rkey);
      return reply;
    },
    onMutate: async (reply) => {
      const refsKey = threadRefsQuery(threadUri).queryKey;
      await queryClient.cancelQueries({ queryKey: refsKey });
      const previousRefs = getRefs(threadUri);
      removeRefAndReply(threadUri, reply.uri, page);
      return { previousRefs };
    },
    onError: (err, _reply, context) => {
      if (context) setRefs(threadUri, context.previousRefs);
      alert(`Could not delete: ${err instanceof Error ? err.message : err}`);
    },
  });

  const deleteThreadMutation = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, POST, thread.rkey);
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries(myThreadsQuery(user.pdsUrl, user.did));
      }
      navigate(`/bbs/${handle}`);
    },
    onError: (err) =>
      alert(`Could not delete: ${err instanceof Error ? err.message : err}`),
  });

  const moderationMutationDefaults = { onSuccess: invalidateAllBBSCaches };

  const banMutation = useMutation({
    ...moderationMutationDefaults,
    mutationFn: async (banDid: string) => {
      if (!agent) throw new Error("Not signed in");
      await createBan(agent, banDid);
    },
  });

  const unbanMutation = useMutation({
    ...moderationMutationDefaults,
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, BAN, rkey);
    },
  });

  const hideMutation = useMutation({
    ...moderationMutationDefaults,
    mutationFn: async (uri: string) => {
      if (!agent) throw new Error("Not signed in");
      await createHide(agent, uri);
    },
  });

  const unhideMutation = useMutation({
    ...moderationMutationDefaults,
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, HIDE, rkey);
    },
  });

  // --- Handlers ---

  function onReply(event: SyntheticEvent) {
    event.preventDefault();
    if (createReplyMutation.isPending) return;
    createReplyMutation.mutate({
      body: body.trim(),
      parent: replyingTo?.uri ?? null,
      files,
    });
  }

  function onDeleteThread() {
    if (!confirm("Delete this thread?")) return;
    deleteThreadMutation.mutate();
  }

  function onDeleteReply(reply: Reply) {
    if (!confirm("Delete this reply?")) return;
    deleteReplyMutation.mutate(reply);
  }

  function onBan(banDid: string) {
    if (!confirm("Ban this user from your community?")) return;
    banMutation.mutate(banDid);
  }

  function onUnban(rkey: string) {
    if (!confirm("Unban this user?")) return;
    unbanMutation.mutate(rkey);
  }

  function onHide(uri: string) {
    if (!confirm("Hide this post?")) return;
    hideMutation.mutate(uri);
  }

  function onUnhide(rkey: string) {
    if (!confirm("Unhide this post?")) return;
    unhideMutation.mutate(rkey);
  }

  if (threadHidden) {
    return (
      <p className="text-neutral-400 py-16 text-center">
        This thread has been hidden by the sysop.
      </p>
    );
  }

  return (
    <>
      <ThreadCard
        thread={thread}
        userDid={user?.did}
        sysopDid={bbs.identity.did}
        banRkey={moderation.banRkeys[thread.did] ?? null}
        hideRkey={moderation.hideRkeys[thread.uri] ?? null}
        onDelete={onDeleteThread}
        onBan={() => onBan(thread.did)}
        onUnban={onUnban}
        onHide={() => onHide(thread.uri)}
        onUnhide={onUnhide}
      />

      {totalPages > 1 && (
        <PageNav current={page} total={totalPages} onGo={setPage} />
      )}

      <div className="space-y-2 mt-4">
        {visibleReplies.length === 0 && !user ? (
          <p className="text-neutral-400">No replies yet.</p>
        ) : (
          visibleReplies.map((reply) => {
            const parentReply = reply.parent
              ? parentReplies[reply.parent]
              : null;
            const parentHidden =
              !!parentReply &&
              !isSysop &&
              (moderation.bannedDids.has(parentReply.did) ||
                moderation.hiddenUris.has(parentReply.uri));
            return (
              <ReplyCard
                key={reply.uri}
                reply={reply}
                userDid={user?.did ?? ""}
                sysopDid={bbs.identity.did}
                parentPost={
                  parentHidden ? undefined : (parentReply ?? undefined)
                }
                banRkey={moderation.banRkeys[reply.did] ?? null}
                hideRkey={moderation.hideRkeys[reply.uri] ?? null}
                onReplyTo={() =>
                  setReplyingTo({ uri: reply.uri, handle: reply.handle })
                }
                onParentClick={
                  reply.parent ? () => scrollToReply(reply.parent!) : undefined
                }
                onDelete={() => onDeleteReply(reply)}
                onBan={() => onBan(reply.did)}
                onUnban={onUnban}
                onHide={() => onHide(reply.uri)}
                onUnhide={onUnhide}
              />
            );
          })
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
          posting={createReplyMutation.isPending}
        />
      )}
    </>
  );
}

// --- Cache-update helpers ---

function getRefs(threadUri: string): BacklinkRef[] {
  const key = threadRefsQuery(threadUri).queryKey;
  return queryClient.getQueryData<BacklinkRef[]>(key) ?? [];
}

function setRefs(threadUri: string, refs: BacklinkRef[]) {
  queryClient.setQueryData(threadRefsQuery(threadUri).queryKey, refs);
}

function pageSlice(refs: BacklinkRef[], page: number): BacklinkRef[] {
  const start = (page - 1) * REPLIES_PER_PAGE;
  return refs.slice(start, start + REPLIES_PER_PAGE);
}

function appendRefAndReply(
  threadUri: string,
  newRef: BacklinkRef,
  newReply: Reply,
): BacklinkRef[] {
  const previousRefs = getRefs(threadUri);
  const updatedRefs = [...previousRefs, newRef];

  const newLastPage = Math.max(
    1,
    Math.ceil(updatedRefs.length / REPLIES_PER_PAGE),
  );
  const oldPageRefs = pageSlice(previousRefs, newLastPage);
  const oldKey = threadPageQuery(threadUri, newLastPage, oldPageRefs).queryKey;
  const oldData = queryClient.getQueryData<ReplyPage>(oldKey);

  setRefs(threadUri, updatedRefs);

  const pageRefs = pageSlice(updatedRefs, newLastPage);
  const newKey = threadPageQuery(threadUri, newLastPage, pageRefs).queryKey;
  queryClient.setQueryData<ReplyPage>(newKey, {
    replies: [...(oldData?.replies ?? []), newReply],
    parentReplies: oldData?.parentReplies ?? {},
  });

  return updatedRefs;
}

function removeRefAndReply(
  threadUri: string,
  replyUri: string,
  currentPage: number,
) {
  const previousRefs = getRefs(threadUri);
  const oldPageRefs = pageSlice(previousRefs, currentPage);
  const oldKey = threadPageQuery(threadUri, currentPage, oldPageRefs).queryKey;
  const oldData = queryClient.getQueryData<ReplyPage>(oldKey);

  const updatedRefs = previousRefs.filter((ref) => refToUri(ref) !== replyUri);
  setRefs(threadUri, updatedRefs);

  if (!oldData) return;
  const pageRefs = pageSlice(updatedRefs, currentPage);
  const newKey = threadPageQuery(threadUri, currentPage, pageRefs).queryKey;
  queryClient.setQueryData<ReplyPage>(newKey, {
    ...oldData,
    replies: oldData.replies.filter((r) => r.uri !== replyUri),
  });
}

function buildBreadcrumb(
  bbs: BBS,
  threadTitle: string,
  boardSlug: string,
  handle: string,
) {
  const board = bbs.site.boards.find((b) => b.slug === boardSlug);
  return [
    { label: bbs.site.name, to: `/bbs/${handle}` },
    ...(board
      ? [{ label: board.name, to: `/bbs/${handle}/board/${board.slug}` }]
      : []),
    { label: threadTitle },
  ];
}
