import { useNavigate } from "react-router-dom";
import { formatFullDate, relativeDate } from "../../lib/util";

interface PostMetaProps {
  handle: string;
  createdAt: string;
}

export default function PostMeta({ handle, createdAt }: PostMetaProps) {
  const navigate = useNavigate();

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    navigate(`/profile/${encodeURIComponent(handle)}`);
  }

  return (
    <div className="flex items-baseline gap-2">
      <span
        role="link"
        tabIndex={0}
        onClick={handleClick}
        className="text-neutral-200 hover:underline cursor-pointer"
      >
        {handle}
      </span>
      <span className="text-neutral-600">·</span>
      <time
        className="text-xs text-neutral-500"
        title={formatFullDate(createdAt)}
      >
        {relativeDate(createdAt)}
      </time>
    </div>
  );
}
