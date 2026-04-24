import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { bbsQuery, sysopModerationQuery } from "../lib/queries";
import HandleInput from "../components/form/HandleInput";
import { Button } from "../components/form/Form";
import { useBreadcrumb } from "../hooks/useBreadcrumb";
import { usePageTitle } from "../hooks/usePageTitle";
import { useModerationMutations } from "../hooks/useModerationMutations";

interface ModerationListItemProps {
  label: string;
  href: string;
  title: string;
  actionLabel: string;
  onAction?: () => void;
}

function ModerationListItem({
  label,
  href,
  title,
  actionLabel,
  onAction,
}: ModerationListItemProps) {
  return (
    <div
      title={title}
      className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-800"
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} (opens in new tab)`}
        className="truncate text-neutral-300 hover:text-neutral-200"
      >
        {label}
      </a>
      {onAction && (
        <button
          onClick={onAction}
          className="text-xs text-neutral-400 hover:text-red-400 shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function SysopModerate() {
  const { user } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [hideUri, setHideUri] = useState("");
  usePageTitle("Moderate community — atbbs");

  // requireAuthLoader guarantees user is present at render time.
  const { data: bbs } = useSuspenseQuery(bbsQuery(user!.handle));
  const { data: moderation } = useSuspenseQuery(
    sysopModerationQuery(user!.pdsUrl, user!.did),
  );
  const { banRkeys, bannedHandles, hideRkeys, hidden } = moderation;

  useBreadcrumb(
    [
      { label: bbs.site.name, to: `/bbs/${user!.handle}` },
      { label: "Moderate" },
    ],
    [bbs, user!.handle],
  );

  const { ban, unban, hide, unhide } = useModerationMutations();

  function onBan() {
    const id = identifier.trim();
    if (!id) return;
    ban.mutate(id, { onSuccess: () => setIdentifier("") });
  }

  function onUnban(rkey: string) {
    if (!confirm("Unban this user?")) return;
    unban.mutate(rkey);
  }

  function onHide() {
    const uri = hideUri.trim();
    if (!uri.startsWith("at://")) {
      alert("Enter a valid AT-URI.");
      return;
    }
    hide.mutate(uri, { onSuccess: () => setHideUri("") });
  }

  function onUnhide(rkey: string) {
    if (!confirm("Unhide this post?")) return;
    unhide.mutate(rkey);
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
              <ModerationListItem
                key={did}
                title={did}
                label={bannedHandles[did] ?? did}
                href={`https://pdsls.dev/at/${did}`}
                actionLabel="unban"
                onAction={
                  banRkeys[did] ? () => onUnban(banRkeys[did]) : undefined
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <HandleInput
              name="ban-handle"
              value={identifier}
              onChange={setIdentifier}
              className="flex-1"
            />
            <Button onClick={onBan}>ban</Button>
          </div>
        </div>

        <div>
          <label className="block text-neutral-400 mb-3">Hidden Posts</label>
          <div className="space-y-1 mb-3">
            {hidden.map((post) => (
              <ModerationListItem
                key={post.uri}
                title={post.uri}
                label={`${post.handle} — ${post.title || post.body}`}
                href={`https://pdsls.dev/${post.uri}`}
                actionLabel="unhide"
                onAction={
                  hideRkeys[post.uri]
                    ? () => onUnhide(hideRkeys[post.uri])
                    : undefined
                }
              />
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
            <Button onClick={onHide}>hide</Button>
          </div>
        </div>
      </div>
    </>
  );
}
