import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import HandleInput from "./form/HandleInput";
import { Button } from "./form/Form";
import { resolveIdentity, getRecord } from "../lib/atproto";
import { SITE } from "../lib/lexicon";
import type { DiscoveredBBS } from "../hooks/useDiscovery";

export interface Suggestion {
  to: string;
  name: string;
  handle: string;
}

interface DialBBSProps {
  discovered?: DiscoveredBBS[];
  suggestions?: Suggestion[];
}

const RESOLVE_DEBOUNCE_MS = 300;

export default function DialBBS({ discovered, suggestions }: DialBBSProps) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [resolvedSuggestion, setResolvedSuggestion] =
    useState<Suggestion | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) navigate(`/bbs/${encodeURIComponent(trimmed)}`);
  }

  function onRandom() {
    if (discovered?.length) {
      const pick = discovered[Math.floor(Math.random() * discovered.length)];
      navigate(`/bbs/${encodeURIComponent(pick.handle)}`);
    } else if (suggestions?.length) {
      const pick = suggestions[Math.floor(Math.random() * suggestions.length)];
      navigate(pick.to);
    }
  }

  function onFocus() {
    clearTimeout(blurTimeout.current);
    setFocused(true);
  }

  function onBlur() {
    blurTimeout.current = setTimeout(() => setFocused(false), 150);
  }

  useEffect(() => {
    const query = inputValue.trim();
    if (!query || !query.includes(".")) {
      setResolvedSuggestion(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const identity = await resolveIdentity(query);
        const siteRecord = await getRecord(identity.did, SITE, "self");
        const siteValue = siteRecord.value as { name?: string };
        if (!cancelled) {
          setResolvedSuggestion({
            to: `/bbs/${encodeURIComponent(identity.handle)}`,
            name: siteValue.name ?? identity.handle,
            handle: identity.handle,
          });
        }
      } catch {
        if (!cancelled) setResolvedSuggestion(null);
      }
    }, RESOLVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [inputValue]);

  const filterQuery = inputValue.trim().toLowerCase();
  const staticMatches = (suggestions ?? []).filter(
    (entry) =>
      !filterQuery ||
      entry.name.toLowerCase().includes(filterQuery) ||
      entry.handle.toLowerCase().includes(filterQuery),
  );

  const visibleSuggestions =
    resolvedSuggestion &&
    !staticMatches.some(
      (entry) => entry.handle === resolvedSuggestion.handle,
    )
      ? [resolvedSuggestion, ...staticMatches]
      : staticMatches;

  return (
    <div onFocus={onFocus} onBlur={onBlur}>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <HandleInput
          name="handle"
          value={inputValue}
          onChange={setInputValue}
          required
          className="sm:flex-1"
        />
        <Button type="submit">go</Button>
        <Button type="button" onClick={onRandom}>random</Button>
      </form>
      {focused && visibleSuggestions.length > 0 && (
        <div className="relative">
          <div className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10">
            {visibleSuggestions.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className="block px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 first:rounded-t last:rounded-b"
              >
                {entry.name}
                {entry.name !== entry.handle && (
                  <span className="text-neutral-500 ml-2">{entry.handle}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
