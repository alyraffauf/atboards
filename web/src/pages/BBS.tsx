import { useState, type SyntheticEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useSuspenseQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  UserCog,
  Pencil,
  Shield,
  LayoutGrid,
  Newspaper,
  Megaphone,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { createPost, uploadAttachments } from "../lib/writes";
import { findPinRkey } from "../lib/pins";
import { SITE } from "../lib/lexicon";
import { makeAtUri, nowIso, parseAtUri, truncate } from "../lib/util";
import * as limits from "../lib/limits";
import { bbsQuery, newsQuery, pinsQuery } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { alertOnError } from "../lib/alerts";
import type { NewsPost } from "../lib/bbs";
import ComposeForm from "../components/form/ComposeForm";
import Localtime from "../components/Localtime";
import ListLink from "../components/nav/ListLink";
import ActionBar from "../components/nav/ActionBar";
import { ActionLink } from "../components/nav/ActionButton";
import PinButton from "../components/PinButton";

const INITIAL_NEWS_COUNT = 3;

export default function BBSPage() {
  const { handle } = useParams();
  const { user, agent } = useAuth();
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [newsFiles, setNewsFiles] = useState<File[]>([]);
  const [showAllNews, setShowAllNews] = useState(false);

  const { data: bbs } = useSuspenseQuery(bbsQuery(handle!));
  const { data: news } = useSuspenseQuery(newsQuery(bbs.identity.did));
  const { data: pins } = useQuery({
    ...pinsQuery(user?.pdsUrl ?? "", user?.did ?? ""),
    enabled: !!user,
  });
  const pinRkey = user && pins ? findPinRkey(pins, bbs.identity.did) : null;

  useBreadcrumb(
    [{ label: bbs.site.name, to: `/bbs/${handle}` }],
    [bbs, handle],
  );
  usePageTitle(`${bbs.site.name} — atbbs`);

  const isSysop = user && user.did === bbs.identity.did;

  const postNewsMutation = useMutation({
    mutationFn: async (input: {
      title: string;
      body: string;
      files: File[];
    }) => {
      if (!agent) throw new Error("Not signed in");
      const siteUri = makeAtUri(bbs.identity.did, SITE, "self");
      const attachments = await uploadAttachments(agent, input.files);
      const resp = await createPost(agent, siteUri, input.body, {
        title: input.title,
        attachments,
      });
      return { resp, attachments };
    },
    onSuccess: ({ resp, attachments }, input) => {
      const rkey = parseAtUri(resp.data.uri).rkey;
      const newItem: NewsPost = {
        uri: resp.data.uri,
        rkey,
        title: input.title,
        body: input.body,
        createdAt: nowIso(),
        attachments: attachments.length
          ? (attachments as NewsPost["attachments"])
          : undefined,
      };
      queryClient.setQueryData<NewsPost[]>(
        newsQuery(bbs.identity.did).queryKey,
        (prev) => [newItem, ...(prev ?? [])],
      );
      setNewsTitle("");
      setNewsBody("");
      setNewsFiles([]);
    },
    onError: alertOnError("post"),
  });

  function onPostNews(event: SyntheticEvent) {
    event.preventDefault();
    if (postNewsMutation.isPending) return;
    postNewsMutation.mutate({
      title: newsTitle.trim(),
      body: newsBody.trim(),
      files: newsFiles,
    });
  }

  const visibleNews = showAllNews ? news : news.slice(0, INITIAL_NEWS_COUNT);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-lg text-neutral-200 mb-1">{bbs.site.name}</h1>
        <p className="text-neutral-400 mb-3">{bbs.site.description}</p>
        <ActionBar>
          <PinButton
            key={bbs.identity.did}
            bbsDid={bbs.identity.did}
            initialRkey={pinRkey}
          />
          <ActionLink
            to={`/profile/${encodeURIComponent(handle!)}`}
            icon={UserCog}
          >
            admin
          </ActionLink>
          {isSysop && (
            <ActionLink to="/account/edit" icon={Pencil}>
              edit
            </ActionLink>
          )}
          {isSysop && (
            <ActionLink to="/account/moderate" icon={Shield}>
              moderate
            </ActionLink>
          )}
        </ActionBar>
      </div>

      {bbs.site.intro && (
        <pre className="bg-neutral-900 border border-neutral-800 rounded p-4 mb-8 overflow-x-auto text-neutral-400 text-xs leading-snug">
          {bbs.site.intro}
        </pre>
      )}

      <section className="mb-8">
        <h2 className="text-xs text-neutral-400 uppercase tracking-wide mb-3 inline-flex items-center gap-1.5">
          <LayoutGrid size={12} /> Boards
        </h2>
        <div className="space-y-1">
          {bbs.site.boards.map((board) => (
            <ListLink
              key={board.slug}
              to={`/bbs/${handle}/board/${board.slug}`}
              name={board.name}
              description={board.description}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs text-neutral-400 uppercase tracking-wide mb-3 inline-flex items-center gap-1.5">
          <Newspaper size={12} /> News
        </h2>

        {isSysop && (
          <details className="mb-4 border border-neutral-800 rounded p-4">
            <summary className="text-neutral-300 cursor-pointer inline-flex items-center gap-1.5">
              <Megaphone size={14} /> post news
            </summary>
            <ComposeForm
              className="mt-4"
              onSubmit={onPostNews}
              title={newsTitle}
              onTitleChange={setNewsTitle}
              titlePlaceholder="Headline"
              titleMaxLength={limits.POST_TITLE}
              body={newsBody}
              onBodyChange={setNewsBody}
              bodyPlaceholder="Announcement body..."
              bodyRows={3}
              bodyMaxLength={limits.POST_BODY}
              files={newsFiles}
              onFilesChange={setNewsFiles}
              submitLabel="post"
              posting={postNewsMutation.isPending}
            />
          </details>
        )}

        {news.length ? (
          <>
            {visibleNews.map((item, i) => (
              <Link
                key={item.rkey}
                to={`/bbs/${handle}/news/${item.rkey}`}
                className={`reply-card block bg-neutral-900 border border-neutral-800 rounded p-4 hover:border-neutral-700 ${i < visibleNews.length - 1 ? "mb-2" : ""}`}
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-neutral-200">{item.title}</span>
                  <span className="text-neutral-400">·</span>
                  <Localtime iso={item.createdAt} />
                </div>
                <div className="line-clamp-3 text-neutral-400">
                  {truncate(item.body, 200)}
                </div>
              </Link>
            ))}
            {!showAllNews && news.length > INITIAL_NEWS_COUNT && (
              <button
                onClick={() => setShowAllNews(true)}
                className="text-neutral-400 hover:text-neutral-300 text-xs mt-2 inline-flex items-center gap-1"
              >
                <ChevronDown size={12} /> show more
              </button>
            )}
          </>
        ) : (
          <p className="text-neutral-400">No news yet.</p>
        )}
      </section>
    </>
  );
}
