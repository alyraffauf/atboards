import { Link } from "react-router-dom";
import { ActionLink } from "./nav/ActionButton";

const cardStyle =
  "bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-300 hover:text-neutral-200 hover:border-neutral-700";

interface BBSPanelProps {
  hasBBS: boolean;
  userHandle: string;
  onDelete: () => void;
}

export default function BBSPanel({ hasBBS, userHandle, onDelete }: BBSPanelProps) {
  if (!hasBBS) {
    return (
      <>
        <p className="text-neutral-500 mb-4">
          You haven't set up a BBS yet.
        </p>
        <ActionLink to="/account/create">create a bbs</ActionLink>
      </>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      <Link to={`/bbs/${userHandle}`} className={cardStyle}>
        <div className="text-neutral-200 mb-1">Browse</div>
        <div className="text-xs text-neutral-500">View your BBS.</div>
      </Link>
      <Link to="/account/edit" className={cardStyle}>
        <div className="text-neutral-200 mb-1">Edit</div>
        <div className="text-xs text-neutral-500">Name, boards, intro.</div>
      </Link>
      <Link to="/account/moderate" className={cardStyle}>
        <div className="text-neutral-200 mb-1">Moderate</div>
        <div className="text-xs text-neutral-500">Bans and hidden posts.</div>
      </Link>
      <button
        onClick={onDelete}
        className="text-left bg-neutral-900 border border-neutral-800 rounded px-4 py-3 hover:border-red-900"
      >
        <div className="text-neutral-500 mb-1">Delete</div>
        <div className="text-xs text-neutral-600">Remove your BBS.</div>
      </button>
    </div>
  );
}
