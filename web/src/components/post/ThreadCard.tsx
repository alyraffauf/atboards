import type { ThreadRoot } from "../../lib/thread";
import AttachmentLink from "./AttachmentLink";
import ModerationBadge from "./ModerationBadge";
import PostActions from "./PostActions";
import PostBody, { unembeddedAttachments } from "./PostBody";
import PostMeta from "./PostMeta";

interface ThreadCardProps {
  thread: ThreadRoot;
  userDid?: string;
  sysopDid: string;
  banRkey?: string | null;
  hideRkey?: string | null;
  onDelete: () => void;
  onBan: () => void;
  onUnban: (rkey: string) => void;
  onHide: () => void;
  onUnhide: (rkey: string) => void;
}

export default function ThreadCard({
  thread,
  userDid,
  sysopDid,
  banRkey,
  hideRkey,
  onDelete,
  onBan,
  onUnban,
  onHide,
  onUnhide,
}: ThreadCardProps) {
  const isAuthor = !!(userDid && userDid === thread.did);
  const isSysop = !!(userDid && userDid === sysopDid);
  const isModerated = !!banRkey || !!hideRkey;
  const remaining = unembeddedAttachments(thread.attachments, thread.body);

  return (
    <article
      className={`reply-card bg-neutral-900 border rounded p-4 mb-4 ${
        isModerated ? "border-neutral-800 opacity-60" : "border-neutral-800"
      }`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <PostMeta handle={thread.authorHandle} createdAt={thread.createdAt} />
        <PostActions
          isAuthor={isAuthor}
          isSysop={isSysop}
          banRkey={banRkey}
          hideRkey={hideRkey}
          onDelete={onDelete}
          onBan={onBan}
          onUnban={onUnban}
          onHide={onHide}
          onUnhide={onUnhide}
        />
      </div>
      <ModerationBadge isHidden={!!hideRkey} isBannedAuthor={!!banRkey} />
      <h1 className="text-lg text-neutral-200 font-bold mb-3">
        {thread.title}
      </h1>
      <PostBody
        attachments={thread.attachments}
        pds={thread.authorPds}
        did={thread.did}
      >
        {thread.body}
      </PostBody>
      {remaining.length > 0 && (
        <div className="mt-3 space-y-1">
          {remaining.map((attachment, index) => (
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
