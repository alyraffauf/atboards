import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLoginModal } from "../../lib/loginModal";
import { pickRandomApps } from "../../lib/atprotoApps";
import LoginForm from "../form/LoginForm";
import AtprotoAppsCard from "./AtprotoAppsCard";

export default function LoginModal() {
  const { open, closeLogin } = useLoginModal();
  const [apps] = useState(() => pickRandomApps(3));

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeLogin();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeLogin]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Log in"
      onClick={closeLogin}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-16 md:items-center md:pt-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-lg p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={closeLogin}
          aria-label="Close"
          className="absolute top-3 right-3 text-neutral-500 hover:text-neutral-300"
        >
          <X size={18} />
        </button>

        <h2 className="text-2xl text-neutral-200 mb-4">Log in</h2>
        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
          Use any{" "}
          <a
            href="https://atproto.com"
            className="hover:text-neutral-300 underline underline-offset-2"
          >
            AT Protocol
          </a>{" "}
          account.
        </p>

        <LoginForm autoFocus idPrefix="login-modal" />

        <div className="mt-6">
          <AtprotoAppsCard apps={apps} />
        </div>
      </div>
    </div>
  );
}
