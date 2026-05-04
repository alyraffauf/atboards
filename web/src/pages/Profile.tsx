import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { putProfile } from "../lib/writes";
import { myThreadsQuery, profileQuery } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import ViewProfile from "../components/profile/ViewProfile";
import EditProfile from "../components/profile/EditProfile";
import MyThreadList from "../components/dashboard/MyThreadList";
import ListSkeleton from "../components/layout/ListSkeleton";

export default function Profile() {
  const { handle } = useParams();
  const { user, agent } = useAuth();
  const [editing, setEditing] = useState(false);

  const { data: profile } = useQuery(profileQuery(handle!));
  const { data: threads } = useQuery({
    ...myThreadsQuery(profile?.pdsUrl ?? "", profile?.did ?? ""),
    enabled: !!profile,
  });

  usePageTitle(`${profile?.name ?? handle} — atbbs`);

  const isOwner = user?.handle === handle;

  const saveProfileMutation = useMutation({
    mutationFn: async (input: {
      name?: string;
      pronouns?: string;
      bio?: string;
    }) => {
      if (!agent) throw new Error("Not signed in");
      await putProfile(agent, input.name, input.pronouns, input.bio);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(profileQuery(handle!));
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <EditProfile
        initialName={profile?.name ?? ""}
        initialPronouns={profile?.pronouns ?? ""}
        initialBio={profile?.bio ?? ""}
        onSave={(name, pronouns, bio) =>
          saveProfileMutation.mutateAsync({ name, pronouns, bio })
        }
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <ViewProfile
        handle={handle!}
        profile={profile ?? null}
        isOwner={isOwner}
        onEdit={() => setEditing(true)}
      />
      <div className="mt-8">
        <p className="text-xs text-neutral-400 uppercase tracking-wide mb-3 inline-flex items-center gap-1.5">
          <MessageSquare size={12} /> Recent Threads
        </p>
        {threads ? (
          <MyThreadList threads={threads.slice(0, 5)} />
        ) : (
          <ListSkeleton />
        )}
      </div>
    </>
  );
}
