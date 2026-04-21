import type { HandleMatch } from "../../lib/bsky";

interface HandleSuggestionsProps {
  suggestions: HandleMatch[];
  activeIndex: number;
  onSelect: (handle: string) => void;
  idPrefix: string;
}

export default function HandleSuggestions({
  suggestions,
  activeIndex,
  onSelect,
  idPrefix,
}: HandleSuggestionsProps) {
  return (
    <div className="relative">
      <div
        role="listbox"
        className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded shadow-lg z-10"
      >
        {suggestions.map((suggestion, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={suggestion.handle}
              id={`${idPrefix}-option-${index}`}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(suggestion.handle)}
              className={`flex items-center gap-3 w-full px-3 py-2 text-left first:rounded-t last:rounded-b ${
                isActive ? "bg-neutral-800" : "hover:bg-neutral-800"
              }`}
            >
              {suggestion.avatar && (
                <img
                  src={suggestion.avatar}
                  alt=""
                  className="w-6 h-6 rounded-full shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="text-sm text-neutral-200 truncate">
                  {suggestion.displayName}
                </div>
                <div className="text-xs text-neutral-400 truncate">
                  {suggestion.handle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
