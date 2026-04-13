import AttachmentLink from "./AttachmentLink";
import PostActions from "./PostActions";
import PostBody from "./PostBody";
import PostMeta from "./PostMeta";

export interface Reply {
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

interface ReplyCardProps {
  reply: Reply;
  userDid: string;
  sysopDid: string;
  quoted?: Reply;
  onQuote: () => void;
  onQuoteClick?: () => void;
  onDelete: () => void;
  onBan: () => void;
  onHide: () => void;
}

export default function ReplyCard({
  reply,
  userDid,
  sysopDid,
  quoted,
  onQuote,
  onQuoteClick,
  onDelete,
  onBan,
  onHide,
}: ReplyCardProps) {
  const isAuthor = userDid === reply.did;
  const isSysop = userDid === sysopDid;

  return (
    <div
      id={`reply-${reply.rkey}`}
      className="reply-card border border-neutral-800/50 rounded p-4"
    >
      <div className="flex items-baseline justify-between mb-2">
        <PostMeta handle={reply.handle} createdAt={reply.createdAt} />
        <PostActions
          isAuthor={isAuthor}
          isSysop={isSysop}
          onQuote={userDid ? onQuote : undefined}
          onDelete={onDelete}
          onBan={onBan}
          onHide={onHide}
        />
      </div>

      {quoted && (
        <button
          type="button"
          onClick={onQuoteClick}
          className="block w-full text-left border-l-2 border-neutral-700 pl-3 mb-3 py-1 text-sm text-neutral-500 hover:border-neutral-500 cursor-pointer"
        >
          <span className="text-neutral-400">{quoted.handle}:</span>{" "}
          <PostBody>
            {quoted.body.substring(0, 200) +
              (quoted.body.length > 200 ? "..." : "")}
          </PostBody>
        </button>
      )}

      <PostBody>{reply.body}</PostBody>

      {reply.attachments.map((attachment, index) => (
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
