import { useRef, useState, type SyntheticEvent } from "react";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { useHandleSearch } from "../hooks/useHandleSearch";
import HandleInput from "../components/form/HandleInput";
import { Button } from "../components/form/Form";

export default function Login() {
  const { login } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const matches = useHandleSearch(handle);
  usePageTitle("Login — atbbs");

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(handle.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  function selectHandle(selected: string) {
    setHandle(selected);
    setFocused(false);
  }

  function onFocus() {
    clearTimeout(blurTimeout.current);
    setFocused(true);
  }

  function onBlur() {
    blurTimeout.current = setTimeout(() => setFocused(false), 150);
  }

  return (
    <div className="h-full flex flex-col justify-center overflow-hidden max-w-md mx-auto">
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
            style={{ width: 180, imageRendering: "pixelated" }}
          />
        </picture>
        <h1 className="text-lg text-neutral-200 mb-2">Log in to atbbs</h1>
        <p className="text-neutral-400">Use any atproto account.</p>
      </div>

      {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

      <div onFocus={onFocus} onBlur={onBlur} className="mb-6">
        <form onSubmit={onSubmit} className="flex gap-2">
          <HandleInput
            name="handle"
            value={handle}
            onChange={setHandle}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "..." : "log in"}
          </Button>
        </form>
        {focused && matches.length > 0 && (
          <div className="relative">
            <div className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10">
              {matches.map((match) => (
                <button
                  key={match.handle}
                  type="button"
                  onClick={() => selectHandle(match.handle)}
                  className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-neutral-800 first:rounded-t last:rounded-b"
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

      <div className="bg-neutral-900 border border-neutral-800 rounded p-4 text-sm text-neutral-400 space-y-3">
        <p>Once signed in, you can:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Post threads and replies</li>
          <li>Pin boards you like</li>
          <li>Set up a profile</li>
          <li>Start your own community</li>
        </ul>
        <p className="text-neutral-400 pt-3 border-t border-neutral-800">
          We'll redirect you to your provider to continue.
        </p>
      </div>
    </div>
  );
}
