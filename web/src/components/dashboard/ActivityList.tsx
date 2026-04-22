import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { parseAtUri } from "../../lib/util";
import PostBody from "../post/PostBody";
import PostMeta from "../post/PostMeta";
import type { ActivityItem } from "../../lib/activity";

const PAGE_SIZE = 10;

interface ActivityListProps {
  items: ActivityItem[];
  userHandle: string;
}

export default function ActivityList({ items, userHandle }: ActivityListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (items.length === 0)
    return <p className="text-neutral-400">No activity yet.</p>;

  return (
    <div>
      {items.slice(0, shown).map((item) => {
        const { did: threadDid, rkey: threadRkey } = parseAtUri(item.threadUri);
        const { rkey: replyRkey } = parseAtUri(item.replyUri);
        const url = `/bbs/${userHandle}/thread/${threadDid}/${threadRkey}#reply-${replyRkey}`;
        return (
          <Link
            key={item.replyUri}
            to={url}
            className="block border border-neutral-800/50 rounded p-4 mb-2 hover:bg-neutral-800"
          >
            <PostMeta handle={item.handle} createdAt={item.createdAt} />
            <p className="text-xs text-neutral-400 mb-1">
              {item.type === "parent_reply"
                ? "replied to your reply"
                : `on: ${item.threadTitle}`}
            </p>
            <div className="line-clamp-2">
              <PostBody>{item.body}</PostBody>
            </div>
          </Link>
        );
      })}
      {shown < items.length && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShown((prev) => prev + PAGE_SIZE)}
            className="text-neutral-400 hover:text-neutral-300 inline-flex items-center gap-1"
          >
            <ChevronDown size={14} /> show more
          </button>
        </div>
      )}
    </div>
  );
}
