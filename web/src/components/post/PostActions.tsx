const actionStyle = "text-xs text-neutral-500 hover:text-red-400";

interface PostActionsProps {
  isAuthor: boolean;
  isSysop: boolean;
  onDelete?: () => void;
  onBan?: () => void;
  onHide?: () => void;
  onQuote?: () => void;
}

export default function PostActions({
  isAuthor,
  isSysop,
  onDelete,
  onBan,
  onHide,
  onQuote,
}: PostActionsProps) {
  return (
    <span className="reply-actions flex items-center gap-3">
      {onQuote && (
        <button onClick={onQuote} className="text-xs text-neutral-500 hover:text-neutral-300">
          quote
        </button>
      )}
      {isAuthor && onDelete && (
        <button onClick={onDelete} className={actionStyle}>delete</button>
      )}
      {isSysop && !isAuthor && onBan && (
        <button onClick={onBan} className={actionStyle}>ban</button>
      )}
      {isSysop && onHide && (
        <button onClick={onHide} className={actionStyle}>hide</button>
      )}
    </span>
  );
}
