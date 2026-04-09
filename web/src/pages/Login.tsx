import { useState, type SyntheticEvent } from "react";
import { useAuth } from "../lib/auth";
import { useTitle } from "../hooks/useTitle";

export default function Login() {
  const { login } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useTitle("Login — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(handle.trim());
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">log in</h1>
      <p className="text-neutral-500 mb-6">
        Sign in with your atproto handle to post threads and replies.
      </p>
      {error && <p className="text-red-400 mb-4">{error}</p>}
      <form onSubmit={onSubmit} className="flex gap-2 max-w-md">
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="your-handle.bsky.social"
          required
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
        >
          {busy ? "..." : "log in"}
        </button>
      </form>
    </>
  );
}
