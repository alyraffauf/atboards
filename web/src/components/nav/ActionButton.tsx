import { Link } from "react-router-dom";

const actionStyle =
  "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1 rounded text-xs";

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

interface ActionLinkProps {
  to: string;
  children: React.ReactNode;
}

export function ActionButton({ onClick, children }: ActionButtonProps) {
  return (
    <button onClick={onClick} className={actionStyle}>
      {children}
    </button>
  );
}

export function ActionLink({ to, children }: ActionLinkProps) {
  return (
    <Link to={to} className={actionStyle}>
      {children}
    </Link>
  );
}
