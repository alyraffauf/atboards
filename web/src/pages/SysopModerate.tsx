import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { resolveIdentity } from "../lib/atproto";
import { BAN, HIDE } from "../lib/lexicon";
import { useTitle } from "../hooks/useTitle";
import { createBan, createHide, deleteRecord } from "../lib/writes";
import type { BBS } from "../lib/bbs";
import type { AuthUser } from "../lib/auth";
import type { HiddenInfo } from "../router/loaders";

interface LoaderData {
  user: AuthUser;
  bbs: BBS;
  banRkeys: Record<string, string>;
  bannedHandles: Record<string, string>;
  hideRkeys: Record<string, string>;
  hidden: HiddenInfo[];
}

export default function SysopModerate() {
  const { bbs, banRkeys, bannedHandles, hideRkeys, hidden } =
    useLoaderData() as LoaderData;
  const { agent } = useAuth();
  const revalidator = useRevalidator();
  const [identifier, setIdentifier] = useState("");
  const [hideUri, setHideUri] = useState("");
  useTitle("Moderate BBS — atbbs");

  async function ban() {
    if (!agent) return;
    let id = identifier.trim();
    if (!id) return;
    if (!id.startsWith("did:")) {
      try {
        id = (await resolveIdentity(id)).did;
      } catch {
        alert("Could not resolve handle.");
        return;
      }
    }
    await createBan(agent, id);
    setIdentifier("");
    revalidator.revalidate();
  }

  async function unban(rkey: string) {
    if (!agent) return;
    if (!confirm("Unban this user?")) return;
    await deleteRecord(agent, BAN, rkey);
    revalidator.revalidate();
  }

  async function hide() {
    if (!agent) return;
    const u = hideUri.trim();
    if (!u.startsWith("at://")) {
      alert("Enter a valid AT-URI.");
      return;
    }
    await createHide(agent, u);
    setHideUri("");
    revalidator.revalidate();
  }

  async function unhide(rkey: string) {
    if (!agent) return;
    if (!confirm("Unhide this post?")) return;
    await deleteRecord(agent, HIDE, rkey);
    revalidator.revalidate();
  }

  return (
    <>
      <h1 className="text-lg text-neutral-200 mb-1">Moderate BBS</h1>
      <p className="text-neutral-500 mb-6">
        Manage banned users and hidden posts.
      </p>

      <div className="space-y-8">
        <div>
          <label className="block text-neutral-400 mb-3">Banned Users</label>
          <div className="space-y-1 mb-3">
            {[...bbs.site.bannedDids].map((did) => (
              <div
                key={did}
                title={did}
                className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-900"
              >
                <a
                  href={`https://pdsls.dev/at/${did}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-neutral-300 hover:text-white"
                >
                  {bannedHandles[did] ?? did}
                </a>
                {banRkeys[did] && (
                  <button
                    onClick={() => unban(banRkeys[did])}
                    className="text-xs text-neutral-500 hover:text-red-400 shrink-0"
                  >
                    unban
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="handle to ban"
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            <button
              onClick={ban}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-2 rounded text-xs"
            >
              ban
            </button>
          </div>
        </div>

        <div>
          <label className="block text-neutral-400 mb-3">Hidden Posts</label>
          <div className="space-y-1 mb-3">
            {hidden.map((p) => (
              <div
                key={p.uri}
                title={p.uri}
                className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-neutral-900"
              >
                <a
                  href={`https://pdsls.dev/${p.uri}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-neutral-300 hover:text-white"
                >
                  {p.handle} — {p.title || p.body}
                </a>
                {hideRkeys[p.uri] && (
                  <button
                    onClick={() => unhide(hideRkeys[p.uri])}
                    className="text-xs text-neutral-500 hover:text-red-400 shrink-0"
                  >
                    unhide
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={hideUri}
              onChange={(e) => setHideUri(e.target.value)}
              placeholder="at://did/collection/rkey"
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            <button
              onClick={hide}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-2 rounded text-xs"
            >
              hide
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
