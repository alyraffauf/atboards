import { useState, type SyntheticEvent } from "react";
import { useNavigate, useLoaderData } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { putBoard, putSite } from "../lib/writes";
import { BOARD } from "../lib/lexicon";
import { makeAtUri, nowIso } from "../lib/util";
import * as limits from "../lib/limits";
import { usePageTitle } from "../hooks/usePageTitle";
import { Input, Textarea, Button } from "../components/form/Form";
import BoardRowEditor, {
  type BoardRow,
} from "../components/form/BoardRowEditor";
import type { AuthUser } from "../lib/auth";

export default function SysopCreate() {
  const { user } = useLoaderData() as { user: AuthUser };
  const { agent } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intro, setIntro] = useState("");
  const [boards, setBoards] = useState<BoardRow[]>([
    {
      slug: "general",
      name: "General",
      desc: "Whatever's on your mind.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  usePageTitle("Create BBS — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent) return;
    const cleanBoards = boards
      .map((board) => ({
        slug: board.slug.trim(),
        name: board.name.trim(),
        desc: board.desc.trim(),
      }))
      .filter((board) => board.slug);
    if (!name.trim() || !cleanBoards.length) {
      setError("Name and at least one board are required.");
      return;
    }
    const now = nowIso();
    try {
      for (const board of cleanBoards) {
        await putBoard(
          agent,
          board.slug,
          board.name || board.slug,
          board.desc,
          now,
        );
      }
      await putSite(agent, {
        name: name.trim(),
        description: description.trim(),
        intro,
        boards: cleanBoards.map((board) =>
          makeAtUri(user.did, BOARD, board.slug),
        ),
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
      <p className="text-neutral-400 mb-6">
        Set up your BBS. Your handle becomes the address.
      </p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="text-xs text-neutral-400 uppercase tracking-wide">
            BBS Name
          </label>
          <Input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Cool BBS"
            maxLength={limits.SITE_NAME}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 uppercase tracking-wide">
            Description
          </label>
          <Input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of your BBS"
            maxLength={limits.SITE_DESCRIPTION}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 uppercase tracking-wide">
            Welcome Message
          </label>
          <Textarea
            name="intro"
            rows={6}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="ASCII art, rules, welcome message..."
            maxLength={limits.SITE_INTRO}
          />
        </div>
        <BoardRowEditor boards={boards} onChange={setBoards} />
        <Button type="submit">create bbs</Button>
      </form>
    </>
  );
}
