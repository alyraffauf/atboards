import { useState, type SyntheticEvent } from "react";
import { Link, useRevalidator, useRouteLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { createNews, deleteRecord } from "../lib/writes";
import { NEWS, SITE } from "../lib/lexicon";
import { makeAtUri } from "../lib/util";
import { useTitle } from "../hooks/useTitle";
import Localtime from "../components/Localtime";
import ListLink from "../components/ListLink";
import type { BBSLoaderData } from "../router/loaders";
import PostBody from "../components/PostBody";

export default function BBSPage() {
  const { handle, bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");

  useBreadcrumb(
    [{ label: bbs.site.name, to: `/bbs/${handle}` }],
    [bbs, handle],
  );
  useTitle(`${bbs.site.name} — atbbs`);

  if (user && bbs.site.bannedDids.has(user.did))
    return (
      <p className="text-neutral-500">You have been banned from this BBS.</p>
    );

  const isSysop = user && user.did === bbs.identity.did;

  async function postNews(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent) return;
    const siteUri = makeAtUri(bbs.identity.did, SITE, "self");
    await createNews(agent, siteUri, newsTitle.trim(), newsBody.trim());
    setNewsTitle("");
    setNewsBody("");
    revalidator.revalidate();
  }

  async function removeNews(tid: string) {
    if (!agent) return;
    if (!confirm("Delete this news post?")) return;
    await deleteRecord(agent, NEWS, tid);
    revalidator.revalidate();
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-lg text-neutral-200 mb-1">{bbs.site.name}</h1>
        <p className="text-neutral-500">{bbs.site.description}</p>
      </div>

      {bbs.site.intro && (
        <pre className="bg-neutral-900 border border-neutral-800 rounded p-4 mb-8 overflow-x-auto text-neutral-500 text-xs leading-snug">
          {bbs.site.intro}
        </pre>
      )}

      <section className="mb-8">
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Boards
        </h2>
        <div className="space-y-1">
          {bbs.site.boards.map((b) => (
            <ListLink
              key={b.slug}
              to={`/bbs/${handle}/board/${b.slug}`}
              name={b.name}
              description={b.description}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          News
        </h2>

        {isSysop && (
          <details className="mb-4 border border-neutral-800 rounded p-4">
            <summary className="text-neutral-300 cursor-pointer">
              post news
            </summary>
            <form onSubmit={postNews} className="mt-4 space-y-3">
              <input
                type="text"
                value={newsTitle}
                onChange={(e) => setNewsTitle(e.target.value)}
                placeholder="Headline"
                required
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
              <textarea
                value={newsBody}
                onChange={(e) => setNewsBody(e.target.value)}
                placeholder="Announcement body..."
                required
                rows={3}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-y"
              />
              <button
                type="submit"
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
              >
                post
              </button>
            </form>
          </details>
        )}

        {bbs.news.length ? (
          bbs.news.map((item, i) => (
            <Link
              key={item.tid}
              to={`/bbs/${handle}/news/${item.tid}`}
              className={`reply-card block bg-neutral-900 border border-neutral-800 rounded p-4 hover:border-neutral-700 ${i < bbs.news.length - 1 ? "mb-2" : ""}`}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-neutral-200">{item.title}</span>
                  <span className="text-neutral-600">·</span>
                  <Localtime iso={item.createdAt} />
                </div>
                {isSysop && (
                  <span className="reply-actions">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        removeNews(item.tid);
                      }}
                      className="text-xs text-neutral-500 hover:text-red-400"
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
          ))
        ) : (
          <p className="text-neutral-500">No news yet.</p>
        )}
      </section>
    </>
  );
}
