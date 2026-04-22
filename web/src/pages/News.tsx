import { useNavigate, useParams, useRouteLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { POST } from "../lib/lexicon";
import { deleteRecord } from "../lib/writes";
import { invalidateBBSCache } from "../lib/bbs";
import type { BBSLoaderData } from "../router/loaders";
import NewsCard from "../components/post/NewsCard";

export default function NewsPage() {
  const { handle, tid } = useParams();
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { user, agent } = useAuth();
  const navigate = useNavigate();

  const item = bbs.news.find((news) => news.rkey === tid);

  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${handle}` },
      { label: item?.title ?? "News" },
    ],
    [bbs, handle, tid],
  );
  usePageTitle(
    item ? `${item.title} — ${bbs.site.name}` : `News — ${bbs.site.name}`,
  );

  if (!item) {
    return <p className="text-neutral-400">News post not found.</p>;
  }

  const isSysop = !!(user && user.did === bbs.identity.did);

  async function onDelete() {
    if (!agent || !tid) return;
    if (!confirm("Delete this news post?")) return;
    await deleteRecord(agent, POST, tid);
    invalidateBBSCache();
    navigate(`/bbs/${handle}`, { state: { deletedNewsRkey: tid } });
  }

  return (
    <NewsCard
      news={item}
      handle={handle ?? ""}
      pds={bbs.identity.pds ?? ""}
      did={bbs.identity.did}
      isSysop={isSysop}
      onDelete={onDelete}
    />
  );
}
