import { useRef, useState, useEffect } from "react";
import { Quote, MoreHorizontal, Trash2, Ban, EyeOff } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const canDelete = isAuthor && !!onDelete;
  const canBan = isSysop && !isAuthor && !!onBan;
  const canHide = isSysop && !!onHide;
  const hasModActions = canDelete || canBan || canHide;

  if (!onQuote && !hasModActions) return null;

  function select(action: () => void) {
    setOpen(false);
    action();
  }

  const menuItem =
    "flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800";
  const dangerItem = menuItem + " hover:text-red-400";

  return (
    <div className="relative post-actions" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="text-neutral-400 hover:text-neutral-300"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10 py-1 min-w-28">
          {onQuote && (
            <button onClick={() => select(onQuote)} className={menuItem}>
              <Quote size={12} /> quote
            </button>
          )}

          {onQuote && hasModActions && (
            <div className="border-t border-neutral-800 my-1" />
          )}

          {canDelete && (
            <button onClick={() => select(onDelete)} className={dangerItem}>
              <Trash2 size={12} /> delete
            </button>
          )}
          {canBan && (
            <button onClick={() => select(onBan)} className={dangerItem}>
              <Ban size={12} /> ban
            </button>
          )}
          {canHide && (
            <button onClick={() => select(onHide)} className={dangerItem}>
              <EyeOff size={12} /> hide
            </button>
          )}
        </div>
      )}
    </div>
  );
}
