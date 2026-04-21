import { Await, useRevalidator } from "react-router-dom";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { deleteBBS } from "../lib/deletebbs";
import { useDiscovery } from "../hooks/useDiscovery";
import { usePageTitle } from "../hooks/usePageTitle";
import DialBBS, {
  bbsToSuggestion,
  type Suggestion,
} from "../components/DialBBS";
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
  "py-2 border-b-2 text-neutral-400 hover:text-neutral-300 border-transparent whitespace-nowrap";

export default function Dashboard({
  user,
  hasBBS,
  pins: pinsPromise,
  threads: threadsPromise,
  activity: activityPromise,
}: DashboardData) {
  const { agent } = useAuth();
  const revalidator = useRevalidator();
  const discoveredBBSes = useDiscovery();
  const [tab, setTab] = useState<Tab>("inbox");
  const [pins, setPins] = useState<PinnedBBS[]>([]);
  usePageTitle("atbbs");

  useEffect(() => {
    pinsPromise.then(setPins);
  }, [pinsPromise]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const pinnedDids = new Set(pins.map((pin) => pin.did));
    const fromPins = pins.map(bbsToSuggestion);
    const fromDiscovery = discoveredBBSes
      .filter((bbs) => !pinnedDids.has(bbs.did))
      .slice(0, 5)
      .map(bbsToSuggestion);
    return [...fromPins, ...fromDiscovery];
  }, [pins, discoveredBBSes]);

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
      alert(error instanceof Error ? error.message : "Could not delete BBS.");
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "inbox", label: "Activity" },
    { key: "threads", label: "Threads" },
    { key: "pinned", label: "Pins" },
    { key: "bbs", label: "My BBS" },
  ];

  const loadingFallback = <p className="text-neutral-400">loading...</p>;

  return (
    <>
      <div className="border-b border-neutral-800 mb-6 pb-4">
        <DialBBS discovered={discoveredBBSes} suggestions={suggestions} />
      </div>

      <div
        role="tablist"
        className="flex gap-4 border-b border-neutral-800 mb-6 overflow-x-auto"
      >
        {tabs.map((tabDef) => (
          <button
            key={tabDef.key}
            role="tab"
            aria-selected={tab === tabDef.key}
            onClick={() => setTab(tabDef.key)}
            className={
              tab === tabDef.key ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE
            }
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {tab === "inbox" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            Recent replies from other users.
          </p>
          <Suspense fallback={loadingFallback}>
            <Await resolve={activityPromise}>
              {(items: ActivityItem[]) => (
                <ActivityList items={items} userHandle={user.handle} />
              )}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "threads" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            Threads you've posted across all BBSes.
          </p>
          <Suspense fallback={loadingFallback}>
            <Await resolve={threadsPromise}>
              {(threads: MyThread[]) => <MyThreadList threads={threads} />}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "pinned" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            BBSes you've pinned for quick access.
          </p>
          <Suspense fallback={loadingFallback}>
            <Await resolve={pinsPromise}>
              {(pins: PinnedBBS[]) => <PinnedList pins={pins} />}
            </Await>
          </Suspense>
        </>
      )}

      {tab === "bbs" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">Manage your BBS.</p>
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
