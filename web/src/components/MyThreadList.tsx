import { useState } from "react";
import { Link } from "react-router-dom";
import { parseAtUri } from "../lib/util";
import PostMeta from "./post/PostMeta";
import type { MyThread } from "../router/loaders";

const PAGE_SIZE = 10;

interface MyThreadListProps {
  threads: MyThread[];
}

export default function MyThreadList({ threads }: MyThreadListProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  if (threads.length === 0)
    return <p className="text-neutral-500">You haven't posted any threads yet.</p>;

  return (
    <div>
      {threads.slice(0, shown).map((thread) => {
        const { did, rkey } = parseAtUri(thread.uri);
        const url = `/bbs/${thread.bbsHandle}/thread/${did}/${rkey}`;
        return (
          <Link
            key={thread.uri}
            to={url}
            className="block border border-neutral-800/50 rounded p-4 mb-2 hover:bg-neutral-800"
          >
            <PostMeta handle={thread.bbsHandle} createdAt={thread.createdAt} />
            <p className="text-neutral-200 mt-1">{thread.title}</p>
            <p className="text-neutral-500 text-sm line-clamp-2 mt-1">
              {thread.body.substring(0, 200)}
            </p>
          </Link>
        );
      })}
      {shown < threads.length && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShown((prev) => prev + PAGE_SIZE)}
            className="text-neutral-500 hover:text-neutral-300"
          >
            show more
          </button>
        </div>
      )}
    </div>
  );
}
