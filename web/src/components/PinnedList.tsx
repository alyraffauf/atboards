import { useAuth } from "../lib/auth";
import { deleteRecord } from "../lib/writes";
import { PIN } from "../lib/lexicon";
import ListLink from "./nav/ListLink";
import type { PinnedBBS } from "../router/loaders";

interface PinnedListProps {
  pins: PinnedBBS[];
  onUnpin: (did: string) => void;
}

export default function PinnedList({ pins, onUnpin }: PinnedListProps) {
  const { agent } = useAuth();

  if (pins.length === 0)
    return (
      <p className="text-neutral-500">
        No pinned BBSes yet. Visit a BBS and pin it to see it here.
      </p>
    );

  async function handleUnpin(entry: PinnedBBS) {
    if (!agent) return;
    await deleteRecord(agent, PIN, entry.rkey);
    onUnpin(entry.did);
  }

  return (
    <div className="space-y-1">
      {pins.map((entry) => (
        <div key={entry.did} className="flex items-center group">
          <div className="flex-1 min-w-0">
            <ListLink
              to={`/bbs/${entry.handle}`}
              name={entry.handle}
            />
          </div>
          <button
            onClick={() => handleUnpin(entry)}
            className="text-xs text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-2 shrink-0"
          >
            unpin
          </button>
        </div>
      ))}
    </div>
  );
}
