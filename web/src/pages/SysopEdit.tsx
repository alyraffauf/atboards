import { useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { putBoard, putSite } from "../lib/writes";
import { BOARD } from "../lib/lexicon";
import { makeAtUri, nowIso } from "../lib/util";
import * as limits from "../lib/limits";
import { usePageTitle } from "../hooks/usePageTitle";
import { bbsQuery } from "../lib/queries";
import { Input, Textarea, Button } from "../components/form/Form";
import BoardRowEditor, {
  type BoardRow,
} from "../components/form/BoardRowEditor";

export default function SysopEdit() {
  const { user, agent } = useAuth();
  const navigate = useNavigate();

  // requireAuthLoader has already redirected unauthenticated users, so
  // `user` is non-null at render time.
  const { data: bbs } = useSuspenseQuery(bbsQuery(user!.handle));

  const [name, setName] = useState(bbs.site.name);
  const [description, setDescription] = useState(bbs.site.description);
  const [intro, setIntro] = useState(bbs.site.intro);
  const [boards, setBoards] = useState<BoardRow[]>(
    bbs.site.boards.map((board) => ({
      slug: board.slug,
      name: board.name,
      description: board.description,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  usePageTitle("Edit community — atbbs");

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent || !user || !name.trim()) return;
    const cleanBoards = boards
      .map((board) => ({
        slug: board.slug.trim(),
        name: board.name.trim(),
        description: board.description.trim(),
      }))
      .filter((board) => board.slug);
    const now = nowIso();
    try {
      for (const board of cleanBoards) {
        await putBoard(
          agent,
          board.slug,
          board.name || board.slug,
          board.description,
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
        createdAt: bbs.site.createdAt || now,
        updatedAt: now,
      });
      navigate(`/bbs/${user.handle}`);
    } catch {
      setError("Could not update community.");
    }
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">Edit community</h1>
      <p className="text-neutral-400 mb-6">Update your community.</p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="text-xs text-neutral-400 uppercase tracking-wide">
            Community Name
          </label>
          <Input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            maxLength={limits.SITE_INTRO}
          />
        </div>
        <BoardRowEditor boards={boards} onChange={setBoards} />
        <Button type="submit">save</Button>
      </form>
    </>
  );
}
