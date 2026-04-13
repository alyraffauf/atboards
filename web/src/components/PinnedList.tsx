import { useState } from "react";
import ListLink from "./nav/ListLink";
import type { PinnedBBS } from "../router/loaders";

const PAGE_SIZE = 5;

interface PinnedListProps {
  pins: PinnedBBS[];
}

export default function PinnedList({ pins }: PinnedListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (pins.length === 0)
    return (
      <p className="text-neutral-500">
        No pinned BBSes yet. Visit a BBS and pin it to see it here.
      </p>
    );

  return (
    <div className="space-y-1">
      {pins.slice(0, shown).map((entry) => (
        <ListLink
          key={entry.did}
          to={`/bbs/${entry.handle}`}
          name={entry.name}
          description={entry.handle}
        />
      ))}
      {shown < pins.length && (
        <button
          onClick={() => setShown((prev) => prev + PAGE_SIZE)}
          className="text-xs text-neutral-500 hover:text-neutral-300 mt-2"
        >
          show more
        </button>
      )}
    </div>
  );
}
