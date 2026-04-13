import { useEffect, useState, type SyntheticEvent } from "react";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { useTitle } from "../hooks/useTitle";
import { makeAtUri, parseAtUri, relativeDate } from "../lib/util";
import { BOARD } from "../lib/lexicon";
import { createThread, uploadAttachments } from "../lib/writes";
import * as limits from "../lib/limits";
import ThreadLink from "../components/ThreadLink";
import ComposeForm from "../components/ComposeForm";
import {
  hydrateThreadPage,
  type BBSLoaderData,
  type ThreadItem,
} from "../router/loaders";
import type { Board as BoardType } from "../lib/bbs";

interface LoaderData {
  handle: string;
  board: BoardType;
  threads: ThreadItem[];
  cursor: string | null;
}

export default function BoardPage() {
  const { bbs } = useRouteLoaderData("bbs") as BBSLoaderData;
  const loaded = useLoaderData() as LoaderData;
  const { handle, board } = loaded;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const [extraThreads, setExtraThreads] = useState<ThreadItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(loaded.cursor);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtraThreads([]);
    setCursor(loaded.cursor);
  }, [loaded.threads, loaded.cursor]);

  const threads = [...loaded.threads, ...extraThreads];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useTitle(`${board.name} — ${bbs.site.name}`);
  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${handle}` },
      { label: board.name, to: `/bbs/${handle}/board/${board.slug}` },
    ],
    [bbs, board, handle],
  );

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await hydrateThreadPage(bbs, board.slug, cursor);
      setExtraThreads((prev) => [...prev, ...page.threads]);
      setCursor(page.cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onCreate(e: SyntheticEvent) {
    e.preventDefault();
    if (!agent || !user) {
      alert("Not signed in.");
      return;
    }
    try {
      const { makeAtUri } = await import("../lib/util");
      const { BOARD: BOARD_COL } = await import("../lib/lexicon");
      const boardUri = makeAtUri(bbs.identity.did, BOARD_COL, board.slug);
      const attachments = await uploadAttachments(agent, files);
      const resp = await createThread(
        agent,
        boardUri,
        title.trim(),
        body.trim(),
        attachments,
      );
      setTitle("");
      setBody("");
      setFiles([]);
      setTimeout(() => revalidator.revalidate(), 1500);
      const { did, rkey } = parseAtUri(resp.data.uri);
      navigate(`/bbs/${handle}/thread/${did}/${rkey}`);
    } catch (err: unknown) {
      console.error("createThread failed:", err);
      alert(`Failed to post: ${err instanceof Error ? err.message : err}`);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg text-neutral-200 mb-1">{board.name}</h1>
        <p className="text-neutral-500">{board.description}</p>
      </div>

      {user && (
        <details className="mb-6 border border-neutral-800 rounded p-4">
          <summary className="text-neutral-300 cursor-pointer">
            new thread
          </summary>
          <ComposeForm
            className="mt-4"
            onSubmit={onCreate}
            title={title}
            onTitleChange={setTitle}
            titlePlaceholder="Thread title"
            titleMaxLength={limits.THREAD_TITLE}
            body={body}
            onBodyChange={setBody}
            bodyMaxLength={limits.THREAD_BODY}
            files={files}
            onFilesChange={setFiles}
          />
        </details>
      )}

      <div>
        {threads.length ? (
          threads.map((t) => (
            <ThreadLink
              key={t.uri}
              to={`/bbs/${handle}/thread/${t.did}/${t.rkey}`}
              title={t.title}
              meta={`${t.handle} · ${relativeDate(t.createdAt)}`}
              preview={t.body.substring(0, 120)}
            />
          ))
        ) : (
          <p className="text-neutral-500">No threads yet.</p>
        )}
      </div>

      {cursor && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-neutral-500 hover:text-neutral-300"
          >
            {loadingMore ? "loading…" : "next page →"}
          </button>
        </div>
      )}
    </>
  );
}
