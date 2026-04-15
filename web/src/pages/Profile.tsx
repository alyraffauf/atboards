import { Suspense, useState } from "react";
import { Await, useLoaderData, useRevalidator } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { putProfile } from "../lib/writes";
import ViewProfile from "../components/profile/ViewProfile";
import EditProfile from "../components/profile/EditProfile";
import MyThreadList from "../components/MyThreadList";
import type { MyThread } from "../lib/mythreads";
import type { ProfileLoaderData } from "../router/loaders/profile";

export default function Profile() {
  const { handle, profile, threads } = useLoaderData() as ProfileLoaderData;
  const { user, agent } = useAuth();
  const revalidator = useRevalidator();
  const isOwner = user?.handle === handle;
  const [editing, setEditing] = useState(false);
  usePageTitle(`${profile?.name ?? handle} — atbbs`);

  async function handleSave(name?: string, pronouns?: string, bio?: string) {
    if (!agent) return;
    await putProfile(agent, name, pronouns, bio);
    setEditing(false);
    revalidator.revalidate();
  }

  if (editing) {
    return (
      <EditProfile
        initialName={profile?.name ?? ""}
        initialPronouns={profile?.pronouns ?? ""}
        initialBio={profile?.bio ?? ""}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <ViewProfile
        handle={handle}
        profile={profile}
        isOwner={isOwner}
        onEdit={() => setEditing(true)}
      />
      <div className="mt-8">
        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Recent Threads
        </p>
        <Suspense
          fallback={<p className="text-neutral-500">Loading...</p>}
        >
          <Await resolve={threads}>
            {(resolved: MyThread[]) => (
              <MyThreadList threads={resolved.slice(0, 5)} />
            )}
          </Await>
        </Suspense>
      </div>
    </>
  );
}
