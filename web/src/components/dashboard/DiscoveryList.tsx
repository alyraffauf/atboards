import ListLink from "../nav/ListLink";
import type { DiscoveredBBS } from "../../hooks/useDiscovery";

interface DiscoveryListProps {
  discovered: DiscoveredBBS[];
  limit?: number;
}

export default function DiscoveryList({
  discovered,
  limit = 5,
}: DiscoveryListProps) {
  if (discovered.length === 0) return null;

  return (
    <div>
      <p className="text-neutral-400 text-xs uppercase tracking-wide mb-3">
        or try one of these
      </p>
      <div className="space-y-1">
        {discovered.slice(0, limit).map((bbs) => (
          <ListLink
            key={bbs.handle}
            to={`/bbs/${encodeURIComponent(bbs.handle)}`}
            name={bbs.name}
            description={bbs.handle}
          />
        ))}
      </div>
    </div>
  );
}
