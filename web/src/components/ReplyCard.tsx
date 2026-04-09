import { formatFullDate, relativeDate } from "../lib/util";

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
  onDelete,
  onBan,
  onHide,
}: ReplyCardProps) {
  const isAuthor = userDid === reply.did;
  const isSysop = userDid === sysopDid;

  return (
    <div className="reply-card border border-neutral-800/50 rounded p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-neutral-300">{reply.handle}</span>
          <span className="text-neutral-600">·</span>
          <time
            className="text-xs text-neutral-500"
            title={formatFullDate(reply.createdAt)}
          >
            {relativeDate(reply.createdAt)}
          </time>
        </div>
        <span className="reply-actions flex items-center gap-3">
          {userDid && (
            <button
              onClick={onQuote}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              quote
            </button>
          )}
          {isAuthor && (
            <button
              onClick={onDelete}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              delete
            </button>
          )}
          {isSysop && !isAuthor && (
            <button
              onClick={onBan}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              ban
            </button>
          )}
          {isSysop && (
            <button
              onClick={onHide}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              hide
            </button>
          )}
        </span>
      </div>

      {quoted && (
        <div className="border-l-2 border-neutral-700 pl-3 mb-3 py-1 text-sm text-neutral-500">
          <span className="text-neutral-400">{quoted.handle}:</span>{" "}
          {quoted.body.substring(0, 200)}
          {quoted.body.length > 200 ? "..." : ""}
        </div>
      )}

      <p className="text-neutral-400 whitespace-pre-wrap leading-relaxed">
        {reply.body}
      </p>

      {reply.attachments.map((attachment, i) => (
        <a
          key={i}
          href={`${reply.pds}/xrpc/com.atproto.sync.getBlob?did=${reply.did}&cid=${attachment.file.ref.$link}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 hover:text-neutral-300 block mt-1"
        >
          [{attachment.name}]
        </a>
      ))}
    </div>
  );
}
