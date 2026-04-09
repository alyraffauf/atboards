import { useState, type SyntheticEvent } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { putBoard, putSite } from "../lib/writes";
import { nowIso } from "../lib/util";
import { useTitle } from "../hooks/useTitle";
import { Input, Textarea, Button } from "../components/Form";
import BoardRowEditor, { type BoardRow } from "../components/BoardRowEditor";
import type { BBS } from "../lib/bbs";
import type { AuthUser } from "../lib/auth";

interface LoaderData {
  user: AuthUser;
  bbs: BBS;
}

export default function SysopEdit() {
  const { user, bbs } = useLoaderData() as LoaderData;
  const { agent } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(bbs.site.name);
  const [description, setDescription] = useState(bbs.site.description);
  const [intro, setIntro] = useState(bbs.site.intro);
  const [boards, setBoards] = useState<BoardRow[]>(
    bbs.site.boards.map((b) => ({
      slug: b.slug,
      name: b.name,
      desc: b.description,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  useTitle("Edit BBS — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent || !name.trim()) return;
    const cleanBoards = boards
      .map((b) => ({ slug: b.slug.trim(), name: b.name.trim(), desc: b.desc.trim() }))
      .filter((b) => b.slug);
    const now = nowIso();
    try {
      for (const b of cleanBoards) {
        await putBoard(agent, b.slug, b.name || b.slug, b.desc, now);
      }
      await putSite(agent, {
        name: name.trim(),
        description: description.trim(),
        intro,
        boards: cleanBoards.map((b) => b.slug),
        createdAt: bbs.site.createdAt || now,
        updatedAt: now,
      });
      navigate(`/bbs/${user.handle}`);
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
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Welcome Message</label>
          <Textarea rows={6} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <BoardRowEditor boards={boards} onChange={setBoards} />
        <Button type="submit">save changes</Button>
      </form>
    </>
  );
}
