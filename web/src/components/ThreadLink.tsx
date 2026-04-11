import { Link } from "react-router-dom";

interface ThreadLinkProps {
  to: string;
  title: string;
  meta: string;
  preview: string;
}

export default function ThreadLink({
  to,
  title,
  meta,
  preview,
}: ThreadLinkProps) {
  return (
    <Link
      to={to}
      className="block px-3 py-4 -mx-3 rounded hover:bg-neutral-900 group"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-neutral-300 group-hover:text-white truncate">
          {title}
        </span>
        <span className="shrink-0 text-xs text-neutral-500">{meta}</span>
      </div>
      <p className="text-neutral-500 text-xs mt-1 line-clamp-1">{preview}</p>
    </Link>
  );
}
