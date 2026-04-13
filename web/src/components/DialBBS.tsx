import { useRef, useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import HandleInput from "./form/HandleInput";
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

export default function DialBBS({ discovered, suggestions }: DialBBSProps) {
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = handle.trim();
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

  const hasSuggestions = suggestions && suggestions.length > 0;

  const query = handle.trim().toLowerCase();
  const filteredSuggestions = hasSuggestions
    ? query
      ? suggestions.filter(
          (entry) =>
            entry.name.toLowerCase().includes(query) ||
            entry.handle.toLowerCase().includes(query),
        )
      : suggestions
    : [];

  return (
    <div onFocus={hasSuggestions ? onFocus : undefined} onBlur={hasSuggestions ? onBlur : undefined}>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <HandleInput
          name="handle"
          value={handle}
          onChange={setHandle}
          required
          className="sm:flex-1"
        />
        <button
          type="submit"
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
        >
          go
        </button>
        <button
          type="button"
          onClick={onRandom}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
        >
          random
        </button>
      </form>
      {focused && filteredSuggestions.length > 0 && (
        <div className="relative">
          <div className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10">
            {filteredSuggestions.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className="block px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 first:rounded-t last:rounded-b"
              >
                {entry.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
