import { useNavigate, useParams, useRouteLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { useTitle } from "../hooks/useTitle";
import { formatFullDate, relativeDate } from "../lib/util";
import { NEWS } from "../lib/lexicon";
import { deleteRecord } from "../lib/writes";
import type { BBSLoaderData } from "../router/loaders";
import PostBody from "../components/PostBody";

export default function NewsPage() {
  const { handle, tid } = useParams();
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { user, agent } = useAuth();
  const navigate = useNavigate();

  const item = bbs.news.find((n) => n.tid === tid);

  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${handle}` },
      { label: item?.title ?? "News" },
    ],
    [bbs, handle, tid],
  );
  useTitle(
    item ? `${item.title} — ${bbs.site.name}` : `News — ${bbs.site.name}`,
  );

  if (!item) {
    return <p className="text-neutral-500">News post not found.</p>;
  }

  const isSysop = user && user.did === bbs.identity.did;

  async function onDelete() {
    if (!agent || !tid) return;
    if (!confirm("Delete this news post?")) return;
    await deleteRecord(agent, NEWS, tid);
    navigate(`/bbs/${handle}`);
  }

  return (
    <article className="bg-neutral-900 border border-neutral-800 rounded p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-neutral-200">{handle}</span>
          <span className="text-neutral-600">·</span>
          <time
            className="text-xs text-neutral-500"
            title={formatFullDate(item.createdAt)}
          >
            {relativeDate(item.createdAt)}
          </time>
        </div>
        {isSysop && (
          <button
            onClick={onDelete}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            delete
          </button>
        )}
      </div>
      <h1 className="text-lg text-neutral-200 font-bold mb-3">{item.title}</h1>
      <PostBody>{item.body}</PostBody>
    </article>
  );
}
