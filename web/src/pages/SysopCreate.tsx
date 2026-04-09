import { useState, type SyntheticEvent } from "react";
import { useNavigate, useLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { putBoard, putSite } from "../lib/writes";
import { nowIso } from "../lib/util";
import { useTitle } from "../hooks/useTitle";
import { Input, Textarea, Button } from "../components/Form";
import BoardRowEditor, { type BoardRow } from "../components/BoardRowEditor";
import type { AuthUser } from "../lib/auth";

export default function SysopCreate() {
  const { user } = useLoaderData() as { user: AuthUser };
  const { agent } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intro, setIntro] = useState("");
  const [boards, setBoards] = useState<BoardRow[]>([
    { slug: "general", name: "General Discussion", desc: "Whatever's on your mind." },
  ]);
  const [error, setError] = useState<string | null>(null);

  useTitle("Create BBS — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent) return;
    const cleanBoards = boards
      .map((b) => ({ slug: b.slug.trim(), name: b.name.trim(), desc: b.desc.trim() }))
      .filter((b) => b.slug);
    if (!name.trim() || !cleanBoards.length) {
      setError("Name and at least one board are required.");
      return;
    }
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
        createdAt: now,
      });
      navigate(`/bbs/${user.handle}`);
    } catch {
      setError("Could not create BBS.");
    }
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">Create a BBS</h1>
      <p className="text-neutral-500 mb-6">
        Set up your BBS. Your handle becomes the address.
      </p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-neutral-400 mb-1">BBS Name</label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Cool BBS"
          />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of your BBS"
          />
        </div>
        <div>
          <label className="block text-neutral-400 mb-1">Welcome Message</label>
          <Textarea
            rows={6}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="ASCII art, rules, welcome message..."
          />
        </div>
        <BoardRowEditor boards={boards} onChange={setBoards} />
        <Button type="submit">create bbs</Button>
      </form>
    </>
  );
}
