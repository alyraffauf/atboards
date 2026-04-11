import { Link } from "react-router-dom";

interface ListLinkProps {
  to: string;
  name: string;
  description?: string;
}

export default function ListLink({ to, name, description }: ListLinkProps) {
  return (
    <Link
      to={to}
      className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-900 group"
    >
      <span className="text-neutral-200 group-hover:text-white">{name}</span>
      {description && (
        <span className="text-neutral-500 text-xs sm:text-sm">
          {description}
        </span>
      )}
    </Link>
  );
}
