import { useNavigate, useParams } from "react-router-dom";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { POST } from "../lib/lexicon";
import { deleteRecord } from "../lib/writes";
import { bbsQuery, newsQuery } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { alertOnError } from "../lib/alerts";
import type { NewsPost } from "../lib/bbs";
import NewsCard from "../components/post/NewsCard";

export default function NewsPage() {
  const { handle, tid } = useParams();
  const { user, agent } = useAuth();
  const navigate = useNavigate();

  const { data: bbs } = useSuspenseQuery(bbsQuery(handle!));
  const { data: news } = useSuspenseQuery(newsQuery(bbs.identity.did));
  const item = news.find((n) => n.rkey === tid);

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

  const isSysop = !!(user && user.did === bbs.identity.did);

  const deleteNewsMutation = useMutation({
    mutationFn: async () => {
      if (!agent || !tid) throw new Error("Not signed in");
      await deleteRecord(agent, POST, tid);
    },
    onSuccess: () => {
      queryClient.setQueryData<NewsPost[]>(
        newsQuery(bbs.identity.did).queryKey,
        (prev) => (prev ?? []).filter((n) => n.rkey !== tid),
      );
      navigate(`/bbs/${handle}`);
    },
    onError: alertOnError("delete"),
  });

  if (!item) {
    return <p className="text-neutral-400">News post not found.</p>;
  }

  return (
    <NewsCard
      news={item}
      handle={handle ?? ""}
      pds={bbs.identity.pds ?? ""}
      did={bbs.identity.did}
      isSysop={isSysop}
      onDelete={() => {
        if (!confirm("Delete this news post?")) return;
        deleteNewsMutation.mutate();
      }}
    />
  );
}
