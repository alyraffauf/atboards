import { formatFullDate, relativeDate } from "../../lib/util";

interface PostMetaProps {
  handle: string;
  createdAt: string;
}

export default function PostMeta({ handle, createdAt }: PostMetaProps) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-neutral-200">{handle}</span>
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
