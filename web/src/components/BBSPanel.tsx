import { Link } from "react-router-dom";
import { Monitor, Pencil, Shield, Trash2, Plus } from "lucide-react";
import { ActionLink } from "./nav/ActionButton";

const cardStyle =
  "bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-300 hover:text-neutral-200 hover:border-neutral-700";

interface BBSPanelProps {
  hasBBS: boolean;
  userHandle: string;
  onDelete: () => void;
}

export default function BBSPanel({
  hasBBS,
  userHandle,
  onDelete,
}: BBSPanelProps) {
  if (!hasBBS) {
    return (
      <>
        <p className="text-neutral-400 mb-4">No community yet.</p>
        <ActionLink to="/account/create" icon={Plus}>
          create a community
        </ActionLink>
      </>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      <Link to={`/bbs/${userHandle}`} className={cardStyle}>
        <div className="flex items-center gap-2 text-neutral-200 mb-1">
          <Monitor size={14} /> Browse
        </div>
        <div className="text-xs text-neutral-400">View your community.</div>
      </Link>
      <Link to="/account/edit" className={cardStyle}>
        <div className="flex items-center gap-2 text-neutral-200 mb-1">
          <Pencil size={14} /> Edit
        </div>
        <div className="text-xs text-neutral-400">Update name and boards.</div>
      </Link>
      <Link to="/account/moderate" className={cardStyle}>
        <div className="flex items-center gap-2 text-neutral-200 mb-1">
          <Shield size={14} /> Moderate
        </div>
        <div className="text-xs text-neutral-400">Ban users and hide posts.</div>
      </Link>
      <button
        onClick={onDelete}
        className="text-left bg-neutral-900 border border-neutral-800 rounded px-4 py-3 hover:border-red-900"
      >
        <div className="flex items-center gap-2 text-neutral-400 mb-1">
          <Trash2 size={14} /> Delete
        </div>
        <div className="text-xs text-neutral-400">Remove your community.</div>
      </button>
    </div>
  );
}
