import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ensureAuthReady, takePostLoginRedirect } from "../lib/auth";

/**
 * BrowserOAuthClient.init() (called by ensureAuthReady at module load) detects
 * the ?code/?state in the URL and exchanges them. We just wait for it to
 * finish and then bounce to wherever the user came from.
 */
export default function Callback() {
  const nav = useNavigate();
  useEffect(() => {
    ensureAuthReady().then(() => {
      const dest = takePostLoginRedirect() ?? "/";
      nav(dest, { replace: true });
    });
  }, [nav]);
  return <p className="text-neutral-500">Signing in…</p>;
}
