import { useState, type FormEvent } from "react";
import { Link, useRevalidator, useRouteLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../lib/breadcrumb";
import { createNews, deleteRecord } from "../lib/writes";
import { NEWS, SITE } from "../lib/lexicon";
import { makeAtUri, useTitle } from "../lib/util";
import Localtime from "../components/Localtime";
import type { BBSLoaderData } from "../loaders";

export default function SitePage() {
  const { handle, bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");

  useBreadcrumb([{ label: bbs.site.name, to: `/bbs/${handle}` }], [bbs, handle]);
  useTitle(`${bbs.site.name} — atbbs`);

  if (user && bbs.site.bannedDids.has(user.did))
    return (
      <p className="text-neutral-500">You have been banned from this BBS.</p>
    );

  const isSysop = user && user.did === bbs.identity.did;

  async function postNews(e: FormEvent) {
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
            <Link
              key={b.slug}
              to={`/bbs/${handle}/board/${b.slug}`}
              className="flex items-baseline gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-900 group"
            >
              <span className="text-neutral-200 group-hover:text-white">
                {b.name}
              </span>
              <span className="text-neutral-500">{b.description}</span>
            </Link>
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
            <div
              key={item.tid}
              className={`reply-card bg-neutral-900 border border-neutral-800 rounded p-4 ${i < bbs.news.length - 1 ? "mb-2" : ""}`}
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
                      onClick={() => removeNews(item.tid)}
                      className="text-xs text-neutral-500 hover:text-red-400"
                    >
                      delete
                    </button>
                  </span>
                )}
              </div>
              <p className="text-neutral-400 whitespace-pre-wrap leading-relaxed">
                {item.body}
              </p>
            </div>
          ))
        ) : (
          <p className="text-neutral-500">No news yet.</p>
        )}
      </section>
    </>
  );
}
