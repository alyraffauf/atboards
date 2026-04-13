import { useState, type SyntheticEvent } from "react";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import HandleInput from "../components/form/HandleInput";

export default function Login() {
  const { login } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePageTitle("Login — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(handle.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
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
        <HandleInput
          name="handle"
          value={handle}
          onChange={setHandle}
          required
          className="flex-1"
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
