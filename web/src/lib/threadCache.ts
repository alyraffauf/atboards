import { queryClient } from "./queryClient";
import { threadPageQuery, threadRefsQuery } from "./queries";
import { REPLIES_PER_PAGE, refToUri } from "./replies";
import type { BacklinkRef } from "./atproto";
import type { ReplyPage } from "./thread";
import type { Reply } from "../components/post/ReplyCard";

export async function cancelRefsRefetch(threadUri: string) {
  await queryClient.cancelQueries({
    queryKey: threadRefsQuery(threadUri).queryKey,
  });
}

export function getRefs(threadUri: string): BacklinkRef[] {
  const key = threadRefsQuery(threadUri).queryKey;
  return queryClient.getQueryData<BacklinkRef[]>(key) ?? [];
}

export function setRefs(threadUri: string, refs: BacklinkRef[]) {
  queryClient.setQueryData(threadRefsQuery(threadUri).queryKey, refs);
}

function pageSlice(refs: BacklinkRef[], page: number): BacklinkRef[] {
  const start = (page - 1) * REPLIES_PER_PAGE;
  return refs.slice(start, start + REPLIES_PER_PAGE);
}

// threadPageQuery's key is fingerprinted by reply rkeys, so adding or removing
// a reply changes the cache key. We read the pre-change page data from the old
// key and seed the new key explicitly.
export function appendRefAndReply(
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

export function removeRefAndReply(
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
