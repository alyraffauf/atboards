import { useState } from "react";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { resolveIdentity } from "../lib/atproto";
import { BAN, HIDE } from "../lib/lexicon";
import { invalidateAllBBSCaches } from "../lib/bbs";
import { bbsQuery, sysopModerationQuery } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import HandleInput from "../components/form/HandleInput";
import { Button } from "../components/form/Form";
import { usePageTitle } from "../hooks/usePageTitle";
import { createBan, createHide, deleteRecord } from "../lib/writes";
import { alertOnError } from "../lib/alerts";

export default function SysopModerate() {
  const { user, agent } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [hideUri, setHideUri] = useState("");
  usePageTitle("Moderate community — atbbs");

  // requireAuthLoader guarantees user is present at render time.
  const { data: bbs } = useSuspenseQuery(bbsQuery(user!.handle));
  const { data: moderation } = useSuspenseQuery(
    sysopModerationQuery(user!.pdsUrl, user!.did),
  );
  const { banRkeys, bannedHandles, hideRkeys, hidden } = moderation;

  function refreshModeration() {
    queryClient.invalidateQueries(
      sysopModerationQuery(user!.pdsUrl, user!.did),
    );
    invalidateAllBBSCaches();
  }

  const banMutation = useMutation({
    mutationFn: async (identifier: string) => {
      if (!agent) throw new Error("Not signed in");
      let did = identifier;
      if (!did.startsWith("did:")) did = (await resolveIdentity(did)).did;
      await createBan(agent, did);
    },
    onSuccess: () => {
      setIdentifier("");
      refreshModeration();
    },
    onError: alertOnError("ban"),
  });

  const unbanMutation = useMutation({
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, BAN, rkey);
    },
    onSuccess: refreshModeration,
  });

  const hideMutation = useMutation({
    mutationFn: async (uri: string) => {
      if (!agent) throw new Error("Not signed in");
      await createHide(agent, uri);
    },
    onSuccess: () => {
      setHideUri("");
      refreshModeration();
    },
  });

  const unhideMutation = useMutation({
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteRecord(agent, HIDE, rkey);
    },
    onSuccess: refreshModeration,
  });

  function ban() {
    const id = identifier.trim();
    if (!id) return;
    banMutation.mutate(id);
  }

  function unban(rkey: string) {
    if (!confirm("Unban this user?")) return;
    unbanMutation.mutate(rkey);
  }

  function hide() {
    const uri = hideUri.trim();
    if (!uri.startsWith("at://")) {
      alert("Enter a valid AT-URI.");
      return;
    }
    hideMutation.mutate(uri);
  }

  function unhide(rkey: string) {
    if (!confirm("Unhide this post?")) return;
    unhideMutation.mutate(rkey);
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">Moderate community</h1>
      <p className="text-neutral-400 mb-6">
        Manage banned users and hidden posts for {bbs.site.name}.
      </p>

      <div className="space-y-8">
        <div>
          <label className="block text-neutral-400 mb-3">Banned Users</label>
          <div className="space-y-1 mb-3">
            {Object.keys(banRkeys).map((did) => (
              <div
                key={did}
                title={did}
                className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-800"
              >
                <a
                  href={`https://pdsls.dev/at/${did}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${bannedHandles[did] ?? did} (opens in new tab)`}
                  className="truncate text-neutral-300 hover:text-neutral-200"
                >
                  {bannedHandles[did] ?? did}
                </a>
                {banRkeys[did] && (
                  <button
                    onClick={() => unban(banRkeys[did])}
                    className="text-xs text-neutral-400 hover:text-red-400 shrink-0"
                  >
                    unban
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <HandleInput
              name="ban-handle"
              value={identifier}
              onChange={setIdentifier}
              className="flex-1"
            />
            <Button onClick={ban}>ban</Button>
          </div>
        </div>

        <div>
          <label className="block text-neutral-400 mb-3">Hidden Posts</label>
          <div className="space-y-1 mb-3">
            {hidden.map((post) => (
              <div
                key={post.uri}
                title={post.uri}
                className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-800"
              >
                <a
                  href={`https://pdsls.dev/${post.uri}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${post.handle} — ${post.title || post.body} (opens in new tab)`}
                  className="truncate text-neutral-300 hover:text-neutral-200"
                >
                  {post.handle} — {post.title || post.body}
                </a>
                {hideRkeys[post.uri] && (
                  <button
                    onClick={() => unhide(hideRkeys[post.uri])}
                    className="text-xs text-neutral-400 hover:text-red-400 shrink-0"
                  >
                    unhide
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              name="hide-uri"
              type="text"
              value={hideUri}
              onChange={(e) => setHideUri(e.target.value)}
              placeholder="at://did/collection/rkey"
              aria-label="Post URI to hide"
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            <Button onClick={hide}>hide</Button>
          </div>
        </div>
      </div>
    </>
  );
}
