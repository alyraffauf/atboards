import { Await, useRevalidator } from "react-router-dom";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { deleteBBS } from "../lib/deletebbs";
import { useDiscovery } from "../hooks/useDiscovery";
import { usePageTitle } from "../hooks/usePageTitle";
import DialBBS, { type Suggestion } from "../components/DialBBS";
import PinnedList from "../components/PinnedList";
import MyThreadList from "../components/MyThreadList";
import ActivityList from "../components/ActivityList";
import BBSPanel from "../components/BBSPanel";
import type { ActivityItem, PinnedBBS, MyThread } from "../router/loaders";
import type { AuthUser } from "../lib/auth";

export interface DashboardData {
  user: AuthUser;
  hasBBS: boolean;
  pins: Promise<PinnedBBS[]>;
  threads: Promise<MyThread[]>;
  activity: Promise<ActivityItem[]>;
}

type Tab = "inbox" | "threads" | "pinned" | "bbs";

const TAB_STYLE_ACTIVE =
  "py-2 border-b-2 text-neutral-200 border-neutral-200 whitespace-nowrap";
const TAB_STYLE_INACTIVE =
  "py-2 border-b-2 text-neutral-500 hover:text-neutral-300 border-transparent whitespace-nowrap";

export default function Dashboard({ data }: { data: DashboardData }) {
  const { user, hasBBS, pins, threads, activity } = data;
  const { agent } = useAuth();
  const revalidator = useRevalidator();
  const discovered = useDiscovery();
  const [tab, setTab] = useState<Tab>("inbox");
  const [resolvedPins, setResolvedPins] = useState<PinnedBBS[]>([]);
  usePageTitle("atbbs");

  useEffect(() => {
    pins.then(setResolvedPins);
  }, [pins]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const pinnedDids = new Set(resolvedPins.map((entry) => entry.did));
    const fromPins: Suggestion[] = resolvedPins.map((entry) => ({
      to: `/bbs/${entry.handle}`,
      name: entry.name,
      handle: entry.handle,
    }));
    const fromDiscovery: Suggestion[] = discovered
      .filter((entry) => !pinnedDids.has(entry.did))
      .slice(0, 5)
      .map((entry) => ({
        to: `/bbs/${encodeURIComponent(entry.handle)}`,
        name: entry.name,
        handle: entry.handle,
      }));
    return [...fromPins, ...fromDiscovery];
  }, [resolvedPins, discovered]);

  async function handleDeleteBBS() {
    if (!agent) return;
    if (
      !confirm(
        "Are you sure? This will delete your site record, all board records, and all news records. Threads and replies from users will remain in their repos.",
      )
    )
      return;
    try {
      await deleteBBS(agent, user.did, user.pdsUrl);
      revalidator.revalidate();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Could not delete BBS.",
      );
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "inbox", label: "Activity" },
    { key: "threads", label: "Threads" },
    { key: "pinned", label: "Pins" },
    { key: "bbs", label: "My BBS" },
  ];

  const loading = <p className="text-neutral-500">Loading...</p>;

  return (
    <>
      <div className="border-b border-neutral-800 mb-6 pb-4">
        <DialBBS discovered={discovered} suggestions={suggestions} />
      </div>

      <div className="flex gap-4 border-b border-neutral-800 mb-6 overflow-x-auto">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={tab === entry.key ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "inbox" && (
        <>
          <p className="text-neutral-500 text-xs mb-4">
            Recent replies and quotes from other users.
          </p>
          <Suspense fallback={loading}>
            <Await resolve={activity}>
              {(resolved: ActivityItem[]) => (
                <ActivityList items={resolved} userHandle={user.handle} />
              )}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "threads" && (
        <>
          <p className="text-neutral-500 text-xs mb-4">
            Threads you've posted across all BBSes.
          </p>
          <Suspense fallback={loading}>
            <Await resolve={threads}>
              {(resolved: MyThread[]) => <MyThreadList threads={resolved} />}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "pinned" && (
        <>
          <p className="text-neutral-500 text-xs mb-4">
            BBSes you've pinned for quick access.
          </p>
          <Suspense fallback={loading}>
            <Await resolve={pins}>
              {(resolved: PinnedBBS[]) => <PinnedList pins={resolved} />}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "bbs" && (
        <>
          <p className="text-neutral-500 text-xs mb-4">
            Manage your BBS.
          </p>
          <BBSPanel
            hasBBS={hasBBS}
            userHandle={user.handle}
            onDelete={handleDeleteBBS}
          />
        </>
      )}
    </>
  );
}
