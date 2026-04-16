import { useState, type SyntheticEvent } from "react";
import { LogIn, MessageSquare, Pin, User, Monitor } from "lucide-react";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { useHandleSearch } from "../hooks/useHandleSearch";
import { useDropdown } from "../hooks/useDropdown";
import HandleInput from "../components/form/HandleInput";
import { Button } from "../components/form/Form";

export default function Login() {
  const { login } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = useHandleSearch(handle);
  const dropdown = useDropdown(matches.length, (index) =>
    selectHandle(matches[index].handle),
  );
  usePageTitle("Login — atbbs");

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(handle.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not log in.");
      setBusy(false);
    }
  }

  function selectHandle(selected: string) {
    setHandle(selected);
    dropdown.close();
  }

  const dropdownOpen = dropdown.focused && matches.length > 0;

  return (
    <div className="h-full flex flex-col justify-center overflow-hidden">
      <div className="text-center mb-8">
        <picture>
          <source
            srcSet="/hero-dark.svg"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="/hero.svg"
            alt="@bbs"
            className="mx-auto mb-4"
            style={{ width: 276, imageRendering: "pixelated" }}
          />
        </picture>
        <h1 className="text-lg text-neutral-400 mb-2">
          Log in with any{" "}
          <a
            href="https://atproto.com"
            className="text-neutral-400 hover:text-neutral-300 underline underline-offset-2"
          >
            AT Protocol
          </a>{" "}
          account.
        </h1>
      </div>

      {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

      <div
        onFocus={dropdown.onFocus}
        onBlur={dropdown.onBlur}
        onKeyDown={dropdown.onKeyDown}
        className="mb-6"
      >
        <form onSubmit={onSubmit} className="flex gap-2">
          <HandleInput
            name="handle"
            value={handle}
            onChange={setHandle}
            required
            className="flex-1"
            aria-autocomplete="list"
            aria-expanded={dropdownOpen}
            aria-activedescendant={
              dropdown.activeIndex >= 0
                ? `login-option-${dropdown.activeIndex}`
                : undefined
            }
            aria-label="Enter your handle"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "..." : <LogIn size={16} />}
          </Button>
        </form>
        {dropdownOpen && (
          <div className="relative">
            <div
              role="listbox"
              className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10"
            >
              {matches.map((match, index) => (
                <button
                  key={match.handle}
                  id={`login-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === dropdown.activeIndex}
                  onClick={() => selectHandle(match.handle)}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-left first:rounded-t last:rounded-b ${
                    index === dropdown.activeIndex
                      ? "bg-neutral-800"
                      : "hover:bg-neutral-800"
                  }`}
                >
                  {match.avatar && (
                    <img
                      src={match.avatar}
                      alt=""
                      className="w-6 h-6 rounded-full shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-200 truncate">
                      {match.displayName}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">
                      {match.handle}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded p-4 text-xs text-neutral-400 space-y-3">
        <p>Once signed in, you can:</p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2">
            <MessageSquare size={14} /> Post threads and replies
          </li>
          <li className="flex items-center gap-2">
            <Pin size={14} /> Pin boards you like
          </li>
          <li className="flex items-center gap-2">
            <User size={14} /> Set up a profile
          </li>
          <li className="flex items-center gap-2">
            <Monitor size={14} /> Start your own community
          </li>
        </ul>
        <p className="text-neutral-400 pt-3 border-t border-neutral-800">
          We'll redirect you to your provider to continue.
        </p>
      </div>
    </div>
  );
}
