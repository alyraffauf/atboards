import type { ThreadObj } from "../../router/loaders";
import AttachmentLink from "./AttachmentLink";
import PostActions from "./PostActions";
import PostBody from "./PostBody";
import PostMeta from "./PostMeta";

interface ThreadHeaderProps {
  thread: ThreadObj;
  userDid?: string;
  sysopDid: string;
  onDelete: () => void;
  onBan: () => void;
  onHide: () => void;
}

export default function ThreadCard({
  thread,
  userDid,
  sysopDid,
  onDelete,
  onBan,
  onHide,
}: ThreadHeaderProps) {
  const isAuthor = !!(userDid && userDid === thread.did);
  const isSysop = !!(userDid && userDid === sysopDid);

  return (
    <article className="reply-card bg-neutral-900 border border-neutral-800 rounded p-4 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <PostMeta handle={thread.authorHandle} createdAt={thread.createdAt} />
        <PostActions
          isAuthor={isAuthor}
          isSysop={isSysop}
          onDelete={onDelete}
          onBan={onBan}
          onHide={onHide}
        />
      </div>
      <h1 className="text-lg text-neutral-200 font-bold mb-3">
        {thread.title}
      </h1>
      <PostBody>{thread.body}</PostBody>
      {thread.attachments && thread.attachments.length > 0 && (
        <div className="mt-3 space-y-1">
          {thread.attachments.map((attachment, index) => (
            <AttachmentLink
              key={index}
              pds={thread.authorPds}
              did={thread.did}
              cid={attachment.file.ref.$link}
              name={attachment.name}
            />
          ))}
        </div>
      )}
    </article>
  );
}
