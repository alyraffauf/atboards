import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, type AuthUser } from "../lib/auth";
import { deleteBBS } from "../lib/deletebbs";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  activityQuery,
  discoveryQuery,
  homeSysopQuery,
  myThreadsQuery,
  pinsQuery,
} from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { invalidateAllBBSCaches } from "../lib/bbs";
import DialBBS, {
  bbsToSuggestion,
  type Suggestion,
} from "../components/dashboard/DialBBS";
import PinnedList from "../components/dashboard/PinnedList";
import MyThreadList from "../components/dashboard/MyThreadList";
import ActivityList from "../components/dashboard/ActivityList";
import BBSPanel from "../components/dashboard/BBSPanel";
import ListSkeleton from "../components/layout/ListSkeleton";

type Tab = "inbox" | "threads" | "pinned" | "bbs";

const TAB_STYLE_ACTIVE =
  "py-2 border-b-2 text-neutral-200 border-neutral-200 whitespace-nowrap";
const TAB_STYLE_INACTIVE =
  "py-2 border-b-2 text-neutral-400 hover:text-neutral-300 border-transparent whitespace-nowrap";

interface DashboardProps {
  user: AuthUser;
}

export default function Dashboard({ user }: DashboardProps) {
  const { agent } = useAuth();
  const [tab, setTab] = useState<Tab>("inbox");
  usePageTitle("atbbs");

  const { data: sysopInfo } = useQuery(homeSysopQuery(user.did));
  const { data: pins } = useQuery(pinsQuery(user.pdsUrl, user.did));
  const { data: threads } = useQuery(myThreadsQuery(user.pdsUrl, user.did));
  const { data: activity } = useQuery(activityQuery(user.pdsUrl, user.did));
  const { data: discovered } = useQuery(discoveryQuery());

  const suggestions = useMemo<Suggestion[] | undefined>(() => {
    if (!pins || !discovered) return undefined;
    const pinnedDids = new Set(pins.map((pin) => pin.did));
    const fromPins = pins.map(bbsToSuggestion);
    const fromDiscovery = discovered
      .filter((bbs) => !pinnedDids.has(bbs.did))
      .slice(0, 5)
      .map(bbsToSuggestion);
    return [...fromPins, ...fromDiscovery];
  }, [pins, discovered]);

  const deleteBBSMutation = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error("Not signed in");
      await deleteBBS(agent, user.did, user.pdsUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(homeSysopQuery(user.did));
      invalidateAllBBSCaches();
    },
    onError: (error: unknown) => {
      alert(
        error instanceof Error ? error.message : "Could not delete community.",
      );
    },
  });

  function handleDeleteBBS() {
    if (
      !confirm(
        "Are you sure? This will delete your site record, all board records, and all news records. Threads and replies from users will remain in their repos.",
      )
    )
      return;
    deleteBBSMutation.mutate();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "inbox", label: "Activity" },
    { key: "threads", label: "Threads" },
    { key: "pinned", label: "Pins" },
    { key: "bbs", label: "Community" },
  ];

  return (
    <>
      <div className="border-b border-neutral-800 mb-6 pb-4">
        <DialBBS discovered={discovered} suggestions={suggestions} />
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
          {activity ? <ActivityList items={activity} /> : <ListSkeleton />}
        </>
      )}

      {tab === "threads" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            Threads you've posted across all communities.
          </p>
          {threads ? <MyThreadList threads={threads} /> : <ListSkeleton />}
        </>
      )}

      {tab === "pinned" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            Communities you've pinned for quick access.
          </p>
          {pins ? <PinnedList pins={pins} /> : <ListSkeleton />}
        </>
      )}

      {tab === "bbs" && (
        <>
          <p className="text-neutral-400 text-xs mb-4">
            Manage your community.
          </p>
          {sysopInfo ? (
            <BBSPanel
              hasBBS={sysopInfo.hasBBS}
              userHandle={user.handle}
              userDid={user.did}
              bbsName={sysopInfo.bbsName}
              onDelete={handleDeleteBBS}
            />
          ) : (
            <ListSkeleton />
          )}
        </>
      )}
    </>
  );
}

