import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ListLink from "../nav/ListLink";
import type { PinnedBBS } from "../../router/loaders";

const PAGE_SIZE = 5;

interface PinnedListProps {
  pins: PinnedBBS[];
}

export default function PinnedList({ pins }: PinnedListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (pins.length === 0)
    return <p className="text-neutral-400">No pinned communities yet.</p>;

  return (
    <div className="space-y-1">
      {pins.slice(0, shown).map((entry) => (
        <ListLink
          key={entry.did}
          to={`/bbs/${entry.handle}`}
          name={entry.name}
          description={entry.handle}
          avatar={entry.avatar}
          showAvatar
        />
      ))}
      {shown < pins.length && (
        <button
          onClick={() => setShown((prev) => prev + PAGE_SIZE)}
          className="text-xs text-neutral-400 hover:text-neutral-300 mt-2 inline-flex items-center gap-1"
        >
          <ChevronDown size={12} /> show more
        </button>
      )}
    </div>
  );
}
