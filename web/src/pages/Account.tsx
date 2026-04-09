import {
  Await,
  Link,
  useLoaderData,
  useRevalidator,
} from "react-router-dom";
import { Suspense, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  getRecord,
  listRecords,
} from "../lib/atproto";
import { BAN, BOARD, HIDE, NEWS, SITE } from "../lib/lexicon";
import { parseAtUri, relativeDate } from "../lib/util";
import { useTitle } from "../hooks/useTitle";
import { deleteRecord } from "../lib/writes";
import type { InboxItem } from "../router/loaders";
import type { AuthUser } from "../lib/auth";

interface LoaderData {
  user: AuthUser;
  hasBBS: boolean;
  bbsName: string | null;
  items: Promise<InboxItem[]>;
}

const PAGE_SIZE = 10;

export default function Account() {
  const { user, hasBBS, bbsName, items } = useLoaderData() as LoaderData;
  const { agent } = useAuth();
  const revalidator = useRevalidator();
  const [tab, setTab] = useState<"inbox" | "bbs">("inbox");
  useTitle("Account — atbbs");

  async function deleteBBS() {
    if (!agent) return;
    if (
      !confirm(
        "Are you sure? This will delete your site record, all board records, and all news records. Threads and replies from users will remain in their repos.",
      )
    )
      return;
    try {
      const existing = await getRecord(user.did, SITE, "self");
      const slugs: string[] = (existing.value as any).boards ?? [];
      for (const s of slugs) {
        try {
          await deleteRecord(agent, BOARD, s);
        } catch {}
      }
      const newsRecords = await listRecords(user.pdsUrl, user.did, NEWS);
      for (const n of newsRecords) {
        try {
          await deleteRecord(agent, NEWS, parseAtUri(n.uri).rkey);
        } catch {}
      }
      for (const col of [BAN, HIDE]) {
        const recs = await listRecords(user.pdsUrl, user.did, col);
        for (const r of recs) {
          try {
            await deleteRecord(agent, col, parseAtUri(r.uri).rkey);
          } catch {}
        }
      }
      await deleteRecord(agent, SITE, "self");
      revalidator.revalidate();
    } catch {
      alert("Could not fully delete BBS.");
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg text-neutral-200 mb-1">Account</h1>
        <p className="text-neutral-500">
          Logged in as{" "}
          <a
            href={`https://pdsls.dev/at/${user.did}`}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-400 hover:text-neutral-300"
          >
            {user.handle}
          </a>
          .
        </p>
      </div>

      <div className="flex gap-4 border-b border-neutral-800 mb-6">
        <button
          onClick={() => setTab("inbox")}
          className={`py-2 border-b-2 ${tab === "inbox" ? "text-neutral-200 border-neutral-200" : "text-neutral-500 hover:text-neutral-300 border-transparent"}`}
        >
          Messages
        </button>
        <button
          onClick={() => setTab("bbs")}
          className={`py-2 border-b-2 ${tab === "bbs" ? "text-neutral-200 border-neutral-200" : "text-neutral-500 hover:text-neutral-300 border-transparent"}`}
        >
          {hasBBS ? bbsName ?? "Your BBS" : "Your BBS"}
        </button>
      </div>

      {tab === "inbox" && (
        <Suspense
          fallback={<p className="text-neutral-500">Loading...</p>}
        >
          <Await resolve={items}>
            {(resolved: InboxItem[]) => (
              <InboxList items={resolved} userHandle={user.handle} />
            )}
          </Await>
        </Suspense>
      )}

      {tab === "bbs" && (
        <div>
          {hasBBS ? (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link
                to={`/bbs/${user.handle}`}
                className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-300 hover:text-white hover:border-neutral-700"
              >
                <div className="text-neutral-200 mb-1">Browse</div>
                <div className="text-xs text-neutral-500">View your BBS.</div>
              </Link>
              <Link
                to="/account/edit"
                className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-300 hover:text-white hover:border-neutral-700"
              >
                <div className="text-neutral-200 mb-1">Edit</div>
                <div className="text-xs text-neutral-500">
                  Name, boards, intro.
                </div>
              </Link>
              <Link
                to="/account/moderate"
                className="bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-neutral-300 hover:text-white hover:border-neutral-700"
              >
                <div className="text-neutral-200 mb-1">Moderate</div>
                <div className="text-xs text-neutral-500">
                  Bans and hidden posts.
                </div>
              </Link>
              <button
                onClick={deleteBBS}
                className="text-left bg-neutral-900 border border-neutral-800 rounded px-4 py-3 hover:border-red-900"
              >
                <div className="text-neutral-500 mb-1">Delete</div>
                <div className="text-xs text-neutral-600">Remove your BBS.</div>
              </button>
            </div>
          ) : (
            <>
              <p className="text-neutral-500 mb-4">
                You haven't set up a BBS yet.
              </p>
              <Link
                to="/account/create"
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded inline-block"
              >
                create a bbs
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

function InboxList({
  items,
  userHandle,
}: {
  items: InboxItem[];
  userHandle: string;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  if (items.length === 0)
    return <p className="text-neutral-500">No messages yet.</p>;
  return (
    <div>
      {items.slice(0, shown).map((m) => {
        const { did: tDid, rkey: tRkey } = parseAtUri(m.threadUri);
        const url = `/bbs/${userHandle}/thread/${tDid}/${tRkey}?reply=${encodeURIComponent(m.replyUri)}`;
        return (
          <Link
            key={m.replyUri}
            to={url}
            className="block border border-neutral-800/50 rounded p-4 mb-2 hover:bg-neutral-900"
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-neutral-300">{m.handle}</span>
              <span className="text-xs text-neutral-500">
                {relativeDate(m.createdAt)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mb-1">
              {m.type === "quote"
                ? "quoted your reply"
                : `on: ${m.threadTitle}`}
            </p>
            <p className="text-neutral-400">{m.body}</p>
          </Link>
        );
      })}
      {shown < items.length && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="text-neutral-500 hover:text-neutral-300"
          >
            show more
          </button>
        </div>
      )}
    </div>
  );
}
