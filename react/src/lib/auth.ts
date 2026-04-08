/**
 * Module-level auth store. The OAuth client's init() runs once and the
 * resulting session populates this store. Loaders call `ensureAuthReady()`
 * before reading; React components subscribe via `useAuth()`.
 *
 * No provider needed — useSyncExternalStore handles reactivity.
 */

import { useSyncExternalStore } from "react";
import { Agent } from "@atproto/api";
import { getOAuthClient } from "./oauth";
import { resolveIdentity } from "./atproto";

export interface AuthUser {
  did: string;
  handle: string;
  pdsUrl: string;
}

type Status = "loading" | "signedIn" | "signedOut";

let status: Status = "loading";
let currentUser: AuthUser | null = null;
let currentAgent: Agent | null = null;
let initPromise: Promise<void> | null = null;
let postLoginRedirect: string | null = null;

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function adoptSession(session: any): Promise<void> {
  const a = new Agent(session);
  let handle = session.did;
  let pdsUrl = "";
  try {
    const doc = await resolveIdentity(session.did);
    handle = doc.handle;
    pdsUrl = doc.pds ?? "";
  } catch {
    // ignore
  }
  currentAgent = a;
  currentUser = { did: session.did, handle, pdsUrl };
  status = "signedIn";
}

/**
 * Idempotent: kicks off OAuth client.init() once and resolves when the
 * initial session restoration is complete. Loaders await this before
 * inspecting auth state.
 */
export function ensureAuthReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const client = getOAuthClient();
        const result = await client.init();
        if (result?.session) {
          if ((result as any).state) {
            postLoginRedirect = (result as any).state as string;
          }
          await adoptSession(result.session);
        } else {
          status = "signedOut";
        }
      } catch (e) {
        console.error("OAuth init failed:", e);
        status = "signedOut";
      } finally {
        notify();
      }
    })();
  }
  return initPromise;
}

// Kick off init at module load so it's running before any loader fires.
ensureAuthReady();

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

export function getCurrentAgent(): Agent | null {
  return currentAgent;
}

export function getAuthStatus(): Status {
  return status;
}

/** One-shot: returns the path stored in OAuth state during signIn(), then clears it. */
export function takePostLoginRedirect(): string | null {
  const r = postLoginRedirect;
  postLoginRedirect = null;
  return r;
}

export async function login(handle: string): Promise<void> {
  const client = getOAuthClient();
  await client.signIn(handle, { state: window.location.pathname });
}

export async function logout(): Promise<void> {
  const client = getOAuthClient();
  if (currentUser) {
    try {
      await client.revoke(currentUser.did);
    } catch {
      // ignore
    }
  }
  currentUser = null;
  currentAgent = null;
  status = "signedOut";
  notify();
}

interface UseAuthResult {
  status: Status;
  user: AuthUser | null;
  agent: Agent | null;
  login: typeof login;
  logout: typeof logout;
}

interface Snapshot {
  status: Status;
  user: AuthUser | null;
  agent: Agent | null;
}
const snapshot: Snapshot = { status, user: currentUser, agent: currentAgent };
function getSnapshot() {
  // Return a new object only when something changed, so React can shallow-compare.
  if (
    snapshot.status !== status ||
    snapshot.user !== currentUser ||
    snapshot.agent !== currentAgent
  ) {
    snapshot.status = status;
    snapshot.user = currentUser;
    snapshot.agent = currentAgent;
  }
  return snapshot;
}

export function useAuth(): UseAuthResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    status: snap.status,
    user: snap.user,
    agent: snap.agent,
    login,
    logout,
  };
}
