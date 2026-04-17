import { useState, type SyntheticEvent } from "react";
import { Link, useRouteLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { createPost, deleteRecord, uploadAttachments } from "../lib/writes";
import ComposeForm from "../components/form/ComposeForm";
import { POST, SITE } from "../lib/lexicon";
import { makeAtUri, nowIso, parseAtUri } from "../lib/util";
import * as limits from "../lib/limits";
import { usePageTitle } from "../hooks/usePageTitle";
import Localtime from "../components/Localtime";
import ListLink from "../components/nav/ListLink";
import ActionBar from "../components/nav/ActionBar";
import { ActionLink } from "../components/nav/ActionButton";
import PinButton from "../components/PinButton";
import {
  User,
  Pencil,
  Shield,
  LayoutGrid,
  Newspaper,
  Megaphone,
  ChevronDown,
} from "lucide-react";
import type { NewsPost } from "../lib/bbs";
import type { BBSLoaderData } from "../router/loaders";
import PostBody from "../components/post/PostBody";

export default function BBSPage() {
  const { handle, bbs, pinRkey } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { user, agent } = useAuth();
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [newsFiles, setNewsFiles] = useState<File[]>([]);
  const [pendingNews, setPendingNews] = useState<NewsPost[]>([]);
  const [deletedTids, setDeletedTids] = useState<Set<string>>(new Set());
  const [showAllNews, setShowAllNews] = useState(false);
  const [postingNews, setPostingNews] = useState(false);

  useBreadcrumb(
    [{ label: bbs.site.name, to: `/bbs/${handle}` }],
    [bbs, handle],
  );
  usePageTitle(`${bbs.site.name} — atbbs`);

  const isSysop = user && user.did === bbs.identity.did;

  async function postNews(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent || postingNews) return;
    setPostingNews(true);
    try {
      const title = newsTitle.trim();
      const body = newsBody.trim();
      const siteUri = makeAtUri(bbs.identity.did, SITE, "self");
      const attachments = await uploadAttachments(agent, newsFiles);
      const resp = await createPost(agent, siteUri, body, {
        title,
        attachments,
      });
      const rkey = parseAtUri(resp.data.uri).rkey;
      setPendingNews((prev) => [
        { uri: resp.data.uri, rkey, title, body, createdAt: nowIso() },
        ...prev,
      ]);
      setNewsTitle("");
      setNewsBody("");
      setNewsFiles([]);
    } catch (error: unknown) {
      alert(`Could not post: ${error instanceof Error ? error.message : error}`);
    } finally {
      setPostingNews(false);
    }
  }

  async function removeNews(rkey: string) {
    if (!agent) return;
    if (!confirm("Delete this news post?")) return;
    await deleteRecord(agent, POST, rkey);
    setPendingNews((prev) => prev.filter((n) => n.rkey !== rkey));
    setDeletedTids((prev) => new Set(prev).add(rkey));
  }

  // Merge pending news with loader data, deduplicating by rkey and filtering deletes.
  const loaderTids = new Set(bbs.news.map((n) => n.rkey));
  const allNews = [
    ...pendingNews.filter(
      (n) => !loaderTids.has(n.rkey) && !deletedTids.has(n.rkey),
    ),
    ...bbs.news.filter((n) => !deletedTids.has(n.rkey)),
  ];
  const visibleNews = showAllNews ? allNews : allNews.slice(0, 3);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-lg text-neutral-200 mb-1">{bbs.site.name}</h1>
        <p className="text-neutral-400 mb-3">{bbs.site.description}</p>
        <ActionBar>
          <PinButton bbsDid={bbs.identity.did} initialRkey={pinRkey} />
          <ActionLink to={`/profile/${encodeURIComponent(handle)}`} icon={User}>
            owner
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
              onSubmit={postNews}
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
              posting={postingNews}
            />
          </details>
        )}

        {allNews.length ? (
          <>
            {visibleNews.map((item, i) => (
              <Link
                key={item.rkey}
                to={`/bbs/${handle}/news/${item.rkey}`}
                className={`reply-card block bg-neutral-900 border border-neutral-800 rounded p-4 hover:border-neutral-700 ${i < visibleNews.length - 1 ? "mb-2" : ""}`}
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-neutral-200">{item.title}</span>
                    <span className="text-neutral-400">·</span>
                    <Localtime iso={item.createdAt} />
                  </div>
                  {isSysop && (
                    <span className="reply-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          removeNews(item.rkey);
                        }}
                        className="text-xs text-neutral-400 hover:text-red-400"
                      >
                        delete
                      </button>
                    </span>
                  )}
                </div>
                <div className="line-clamp-3 text-neutral-400">
                  {item.body.substring(0, 200) +
                    (item.body.length > 200 ? "..." : "")}
                </div>
              </Link>
            ))}
            {!showAllNews && allNews.length > 3 && (
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
