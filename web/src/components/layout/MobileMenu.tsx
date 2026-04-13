import { Link } from "react-router-dom";
import { useState } from "react";
import type { useAuth } from "../../lib/auth";

interface MobileMenuProps {
  user: ReturnType<typeof useAuth>["user"];
  onLogout: () => void;
}

// Fullscreen on phone, dropdown on tablet
const panelStyle = [
  "z-50 fixed inset-0 top-12.25 bg-neutral-950/95",
  "flex flex-col items-center pt-12 gap-6 text-lg",
  "sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2",
  "sm:bg-neutral-900 sm:border sm:border-neutral-800 sm:rounded",
  "sm:py-2 sm:px-4 sm:gap-2 sm:text-sm sm:pt-0 sm:min-w-40",
].join(" ");

export default function MobileMenu({ user, onLogout }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <div className="md:hidden relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-neutral-400 hover:text-neutral-300 text-lg px-1"
        aria-label="Menu"
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div className={panelStyle}>
          {user ? (
            <>
              <Link to="/account" onClick={close} className="text-neutral-300 hover:text-neutral-200">
                {user.handle}
              </Link>
              <button type="button" onClick={() => { close(); onLogout(); }} className="text-neutral-500 hover:text-neutral-300">
                log out
              </button>
            </>
          ) : (
            <Link to="/login" onClick={close} className="text-neutral-300 hover:text-neutral-200">
              log in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
