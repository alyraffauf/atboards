import { useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import HandleInput from "./form/HandleInput";
import { Button } from "./form/Form";
import { useDropdown } from "../hooks/useDropdown";
import { useResolvedBBS } from "../hooks/useResolvedBBS";
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

function buildVisibleSuggestions(
  staticSuggestions: Suggestion[],
  filterQuery: string,
  resolved: Suggestion | null,
): Suggestion[] {
  const filtered = staticSuggestions.filter(
    (entry) =>
      !filterQuery ||
      entry.name.toLowerCase().includes(filterQuery) ||
      entry.handle.toLowerCase().includes(filterQuery),
  );

  if (!resolved) return filtered;

  const alreadyIncluded = filtered.some(
    (entry) => entry.handle === resolved.handle,
  );
  return alreadyIncluded ? filtered : [resolved, ...filtered];
}

export default function DialBBS({ discovered, suggestions }: DialBBSProps) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const resolved = useResolvedBBS(inputValue);

  const filterQuery = inputValue.trim().toLowerCase();
  const visibleSuggestions = buildVisibleSuggestions(
    suggestions ?? [],
    filterQuery,
    resolved,
  );

  const dropdown = useDropdown(visibleSuggestions.length);
  const dropdownOpen = dropdown.focused && visibleSuggestions.length > 0;

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

  return (
    <div
      onFocus={dropdown.onFocus}
      onBlur={dropdown.onBlur}
      onKeyDown={(event) =>
        dropdown.onKeyDown(event, (index) =>
          navigate(visibleSuggestions[index].to),
        )
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <HandleInput
          name="handle"
          value={inputValue}
          onChange={setInputValue}
          required
          className="sm:flex-1"
          aria-autocomplete="list"
          aria-expanded={dropdownOpen}
          aria-activedescendant={
            dropdown.activeIndex >= 0
              ? `dial-option-${dropdown.activeIndex}`
              : undefined
          }
          aria-label="Dial a BBS by handle"
        />
        <Button type="submit">go</Button>
        <Button type="button" onClick={onRandom}>random</Button>
      </form>
      {dropdownOpen && (
        <div className="relative">
          <div role="listbox" className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10">
            {visibleSuggestions.map((entry, index) => (
              <Link
                key={entry.to}
                id={`dial-option-${index}`}
                to={entry.to}
                role="option"
                aria-selected={index === dropdown.activeIndex}
                className={`block px-3 py-2 text-sm text-neutral-300 first:rounded-t last:rounded-b ${
                  index === dropdown.activeIndex
                    ? "bg-neutral-800"
                    : "hover:bg-neutral-800"
                }`}
              >
                {entry.name}
                {entry.name !== entry.handle && (
                  <span className="text-neutral-400 ml-2">{entry.handle}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
