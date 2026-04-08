import { useState, type FormEvent } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { putBoard, putSite } from "../lib/writes";
import { nowIso, useTitle } from "../lib/util";
import type { BBS } from "../lib/bbs";
import type { AuthUser } from "../lib/auth";

interface BoardRow {
  slug: string;
  name: string;
  desc: string;
}

interface LoaderData {
  user: AuthUser;
  bbs: BBS;
}

export default function SysopEdit() {
  const { user, bbs } = useLoaderData() as LoaderData;
  const { agent } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState(bbs.site.name);
  const [description, setDescription] = useState(bbs.site.description);
  const [intro, setIntro] = useState(bbs.site.intro);
  const [boards, setBoards] = useState<BoardRow[]>(
    bbs.site.boards.map((x) => ({
      slug: x.slug,
      name: x.name,
      desc: x.description,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  useTitle("Edit BBS — atbbs");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agent || !name.trim()) return;
    const cleanBoards = boards
      .map((b) => ({ slug: b.slug.trim(), name: b.name.trim(), desc: b.desc.trim() }))
      .filter((b) => b.slug);
    const now = nowIso();
    const createdAt = bbs.site.createdAt || now;
    try {
      for (const b of cleanBoards) {
        await putBoard(agent, b.slug, b.name || b.slug, b.desc, now);
      }
      await putSite(agent, {
        name: name.trim(),
        description: description.trim(),
        intro,
        boards: cleanBoards.map((b) => b.slug),
        createdAt,
        updatedAt: now,
      });
      nav(`/bbs/${user.handle}`);
    } catch {
      setError("Could not update BBS.");
    }
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">Edit BBS</h1>
      <p className="text-neutral-500 mb-6">Update your BBS.</p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-neutral-400 mb-1">BBS Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Welcome Message</label>
          <textarea
            rows={6}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-y"
          />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Boards</label>
          <p className="text-neutral-500 text-xs mb-2">
            One board per row: slug, name, description
          </p>
          <div className="space-y-2">
            {boards.map((b, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={b.slug}
                  onChange={(e) => {
                    const next = [...boards];
                    next[i].slug = e.target.value;
                    setBoards(next);
                  }}
                  placeholder="slug"
                  className="w-1/4 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                <input
                  type="text"
                  value={b.name}
                  onChange={(e) => {
                    const next = [...boards];
                    next[i].name = e.target.value;
                    setBoards(next);
                  }}
                  placeholder="Name"
                  className="w-1/3 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                <input
                  type="text"
                  value={b.desc}
                  onChange={(e) => {
                    const next = [...boards];
                    next[i].desc = e.target.value;
                    setBoards(next);
                  }}
                  placeholder="Description"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBoards([...boards, { slug: "", name: "", desc: "" }])}
            className="mt-2 text-neutral-500 hover:text-neutral-300 text-xs"
          >
            + add board
          </button>
        </div>
        <button
          type="submit"
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded"
        >
          save changes
        </button>
      </form>
    </>
  );
}
