/** Revalidate active route loaders when the tab regains focus/visibility or
 *  the browser reconnects. Throttled so rapid focus changes don't storm. */

import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router-dom";

const MIN_INTERVAL_MS = 30_000;

export function useRevalidateOnFocus() {
  const revalidator = useRevalidator();
  const lastAt = useRef(0);

  useEffect(() => {
    function maybeRevalidate() {
      if (document.hidden) return;
      if (revalidator.state !== "idle") return;
      const now = Date.now();
      if (now - lastAt.current < MIN_INTERVAL_MS) return;
      lastAt.current = now;
      revalidator.revalidate();
    }

    window.addEventListener("focus", maybeRevalidate);
    window.addEventListener("online", maybeRevalidate);
    document.addEventListener("visibilitychange", maybeRevalidate);
    return () => {
      window.removeEventListener("focus", maybeRevalidate);
      window.removeEventListener("online", maybeRevalidate);
      document.removeEventListener("visibilitychange", maybeRevalidate);
    };
  }, [revalidator]);
}
