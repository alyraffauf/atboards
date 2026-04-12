import { formatFullDate, relativeDate } from "../lib/util";
import type { ThreadObj } from "../router/loaders";
import AttachmentLink from "./AttachmentLink";
import PostBody from "./PostBody";

interface ThreadHeaderProps {
  thread: ThreadObj;
  userDid?: string;
  sysopDid: string;
  onDeleteThread: () => void;
  onBanAuthor: () => void;
  onHideThread: () => void;
}

export default function ThreadHeader({
  thread,
  userDid,
  sysopDid,
  onDeleteThread,
  onBanAuthor,
  onHideThread,
}: ThreadHeaderProps) {
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
      <h1 className="text-lg text-neutral-200 font-bold mb-3">
        {thread.title}
      </h1>
      <PostBody>{thread.body}</PostBody>
      {thread.attachments && thread.attachments.length > 0 && (
        <div className="mt-3 space-y-1">
          {thread.attachments.map((a, i) => (
            <AttachmentLink
              key={i}
              pds={thread.authorPds}
              did={thread.did}
              cid={a.file.ref.$link}
              name={a.name}
            />
          ))}
        </div>
      )}
    </article>
  );
}
