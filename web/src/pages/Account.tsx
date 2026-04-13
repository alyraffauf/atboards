import { Await, useLoaderData, useRevalidator } from "react-router-dom";
import { Suspense, useState } from "react";
import { useAuth } from "../lib/auth";
import { getRecord, listRecords } from "../lib/atproto";
import { BAN, BOARD, HIDE, NEWS, SITE } from "../lib/lexicon";
import { parseAtUri } from "../lib/util";
import { usePageTitle } from "../hooks/usePageTitle";
import { deleteRecord } from "../lib/writes";
import InboxList from "../components/InboxList";
import PinnedList from "../components/PinnedList";
import MyThreadList from "../components/MyThreadList";
import BBSPanel from "../components/BBSPanel";
import type { InboxItem, PinnedBBS, MyThread } from "../router/loaders";
import type { AuthUser } from "../lib/auth";

interface LoaderData {
  user: AuthUser;
  hasBBS: boolean;
  bbsName: string | null;
  items: Promise<InboxItem[]>;
  pins: Promise<PinnedBBS[]>;
  threads: Promise<MyThread[]>;
}

type Tab = "pinned" | "threads" | "inbox" | "bbs";

export default function Account() {
  const { user, hasBBS, bbsName, items, pins, threads } =
    useLoaderData() as LoaderData;
  const { agent } = useAuth();
  const revalidator = useRevalidator();
  const [tab, setTab] = useState<Tab>("pinned");
  const [removedPins, setRemovedPins] = useState<Set<string>>(new Set());
  usePageTitle("Account — atbbs");

  async function deleteBBS() {
    if (!agent) return;
    if (
      !confirm(
        "Are you sure? This will delete your site record, all board records, and all news records. Threads and replies from users will remain in their repos.",
      )
    )
      return;
    try {
      const failed: string[] = [];
      const existing = await getRecord(user.did, SITE, "self");
      const siteValue = existing.value as Record<string, unknown>;
      const slugs: string[] = (
        Array.isArray(siteValue.boards) ? siteValue.boards : []
      ) as string[];
      for (const slug of slugs) {
        try {
          await deleteRecord(agent, BOARD, slug);
        } catch {
          failed.push(`board/${slug}`);
        }
      }
      const newsRecords = await listRecords(user.pdsUrl, user.did, NEWS);
      for (const record of newsRecords) {
        try {
          await deleteRecord(agent, NEWS, parseAtUri(record.uri).rkey);
        } catch {
          failed.push(`news/${parseAtUri(record.uri).rkey}`);
        }
      }
      for (const collection of [BAN, HIDE]) {
        const records = await listRecords(user.pdsUrl, user.did, collection);
        for (const record of records) {
          try {
            await deleteRecord(agent, collection, parseAtUri(record.uri).rkey);
          } catch {
            failed.push(`${collection}/${parseAtUri(record.uri).rkey}`);
          }
        }
      }
      if (failed.length) {
        alert(
          `Could not delete: ${failed.join(", ")}. Site record was not deleted.`,
        );
        return;
      }
      await deleteRecord(agent, SITE, "self");
      revalidator.revalidate();
    } catch {
      alert("Could not delete BBS.");
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "pinned", label: "Pinned" },
    { key: "threads", label: "My Threads" },
    { key: "inbox", label: "Inbox" },
    { key: "bbs", label: hasBBS ? (bbsName ?? "Your BBS") : "Your BBS" },
  ];

  const activeTab = "py-2 border-b-2 text-neutral-200 border-neutral-200";
  const inactiveTab =
    "py-2 border-b-2 text-neutral-500 hover:text-neutral-300 border-transparent";

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

      <div className="flex gap-4 border-b border-neutral-800 mb-6 overflow-x-auto">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={`${tab === entry.key ? activeTab : inactiveTab} whitespace-nowrap`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "pinned" && (
        <Suspense fallback={<p className="text-neutral-500">Loading...</p>}>
          <Await resolve={pins}>
            {(resolved: PinnedBBS[]) => (
              <PinnedList
                pins={resolved.filter((pin) => !removedPins.has(pin.did))}
                onUnpin={(did) =>
                  setRemovedPins((prev) => new Set(prev).add(did))
                }
              />
            )}
          </Await>
        </Suspense>
      )}

      {tab === "threads" && (
        <Suspense fallback={<p className="text-neutral-500">Loading...</p>}>
          <Await resolve={threads}>
            {(resolved: MyThread[]) => <MyThreadList threads={resolved} />}
          </Await>
        </Suspense>
      )}

      {tab === "inbox" && (
        <Suspense fallback={<p className="text-neutral-500">Loading...</p>}>
          <Await resolve={items}>
            {(resolved: InboxItem[]) => (
              <InboxList items={resolved} userHandle={user.handle} />
            )}
          </Await>
        </Suspense>
      )}

      {tab === "bbs" && (
        <BBSPanel
          hasBBS={hasBBS}
          userHandle={user.handle}
          onDelete={deleteBBS}
        />
      )}
    </>
  );
}
