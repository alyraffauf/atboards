import { Link } from "react-router-dom";

const actionStyle =
  "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded";

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

interface ActionLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}

export function ActionButton({
  onClick,
  children,
  className,
}: ActionButtonProps) {
  return (
    <button onClick={onClick} className={`${actionStyle} ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function ActionLink({ to, children, className }: ActionLinkProps) {
  return (
    <Link to={to} className={`${actionStyle} ${className ?? ""}`}>
      {children}
    </Link>
  );
}
