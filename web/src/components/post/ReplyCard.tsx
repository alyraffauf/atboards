import { truncate } from "../../lib/util";
import AttachmentLink from "./AttachmentLink";
import ModerationBadge from "./ModerationBadge";
import PostActions from "./PostActions";
import PostBody, { unembeddedAttachments } from "./PostBody";
import PostMeta from "./PostMeta";

export interface Reply {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  pds: string;
  body: string;
  createdAt: string;
  parent: string | null;
  attachments: { file: { ref: { $link: string } }; name: string }[];
}

interface ReplyCardProps {
  reply: Reply;
  userDid: string;
  sysopDid: string;
  parentPost?: Reply;
  banRkey?: string | null;
  hideRkey?: string | null;
  onReplyTo: () => void;
  onParentClick?: () => void;
  onDelete: () => void;
  onBan: () => void;
  onUnban: (rkey: string) => void;
  onHide: () => void;
  onUnhide: (rkey: string) => void;
}

export default function ReplyCard({
  reply,
  userDid,
  sysopDid,
  parentPost,
  banRkey,
  hideRkey,
  onReplyTo,
  onParentClick,
  onDelete,
  onBan,
  onUnban,
  onHide,
  onUnhide,
}: ReplyCardProps) {
  const isAuthor = userDid === reply.did;
  const isSysop = userDid === sysopDid;
  const isModerated = !!banRkey || !!hideRkey;
  const remaining = unembeddedAttachments(reply.attachments, reply.body);

  return (
    <div
      id={`reply-${reply.rkey}`}
      className={`reply-card border rounded p-4 ${
        isModerated
          ? "border-neutral-800 bg-neutral-900/30 opacity-60"
          : "border-neutral-800/50"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <PostMeta handle={reply.handle} createdAt={reply.createdAt} />
        <PostActions
          isAuthor={isAuthor}
          isSysop={isSysop}
          banRkey={banRkey}
          hideRkey={hideRkey}
          onReplyTo={userDid ? onReplyTo : undefined}
          onDelete={onDelete}
          onBan={onBan}
          onUnban={onUnban}
          onHide={onHide}
          onUnhide={onUnhide}
        />
      </div>

      <ModerationBadge isHidden={!!hideRkey} isBannedAuthor={!!banRkey} />

      {parentPost && (
        <button
          type="button"
          onClick={onParentClick}
          className="block w-full text-left border-l-2 border-neutral-700 pl-3 mb-3 py-1 text-sm text-neutral-400 hover:border-neutral-500 cursor-pointer"
        >
          <span className="text-neutral-400">{parentPost.handle}:</span>{" "}
          <PostBody>{truncate(parentPost.body, 200)}</PostBody>
        </button>
      )}

      <PostBody
        attachments={reply.attachments}
        pds={reply.pds}
        did={reply.did}
      >
        {reply.body}
      </PostBody>

      {remaining.map((attachment, index) => (
        <AttachmentLink
          key={index}
          pds={reply.pds}
          did={reply.did}
          cid={attachment.file.ref.$link}
          name={attachment.name}
        />
      ))}
    </div>
  );
}
