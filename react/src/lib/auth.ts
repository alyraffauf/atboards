/**
 * Auth: a module-level store + a `useAuth()` hook.
 *
 * - At module load we configure atcute's OAuth client (loopback in dev, the
 *   deployed client metadata in prod) and try to resume any saved session
 *   tracked by the "current did" pointer in localStorage.
 * - Loaders await `ensureAuthReady()` before reading. React components
 *   subscribe via `useAuth()` (no provider needed — useSyncExternalStore).
 * - Sessions are stored by atcute itself; we only remember which DID is the
 *   current one so we know what to resume on reload.
 */

import { useSyncExternalStore } from "react";
import { Client } from "@atcute/client";
import {
  configureOAuth,
  createAuthorizationUrl,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  OAuthUserAgent,
} from "@atcute/oauth-browser-client";
import type {
  ActorResolver,
  ResolvedActor,
} from "@atcute/identity-resolver";
import type { ActorIdentifier } from "@atcute/lexicons/syntax";
import { resolveIdentity } from "./atproto";

// --- OAuth bootstrap ---

/**
 * Resolve handles via Slingshot's `blue.microcosm.identity.resolveMiniDoc`
 * (one round-trip → did, handle, pds), so login attempts don't leak through
 * bsky.app's appview.
 */
class SlingshotActorResolver implements ActorResolver {
  async resolve(actor: ActorIdentifier): Promise<ResolvedActor> {
    const doc = await resolveIdentity(actor);
    if (!doc.pds) throw new Error(`No PDS for ${actor}`);
    return {
      did: doc.did as ResolvedActor["did"],
      handle: doc.handle as ResolvedActor["handle"],
      pds: doc.pds,
    };
  }
}

configureOAuth({
  metadata: {
    client_id: import.meta.env.VITE_OAUTH_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_OAUTH_REDIRECT_URI,
  },
  identityResolver: new SlingshotActorResolver(),
});

// --- Public types ---

export interface AuthUser {
  did: string;
  handle: string;
  pdsUrl: string;
}

type Status = "loading" | "signedIn" | "signedOut";

interface AuthSnapshot {
  status: Status;
  user: AuthUser | null;
  agent: Client | null;
}

interface UseAuthResult extends AuthSnapshot {
  login: (handle: string) => Promise<void>;
  logout: () => Promise<void>;
}

// --- Module-level state ---

type Did = `did:${string}:${string}`;

const CURRENT_DID_KEY = "atbbs:current-did";
const POST_LOGIN_KEY = "atbbs:post-login-redirect";

let status: Status = "loading";
let currentUser: AuthUser | null = null;
let currentAgent: Client | null = null;

let initPromise: Promise<void> | null = null;
let callbackPromise: Promise<void> | null = null;

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

async function adoptUserAgent(agent: OAuthUserAgent): Promise<void> {
  const rpc = new Client({ handler: agent });
  const did = agent.sub;

  let handle: string = did;
  let pdsUrl = "";
  try {
    const doc = await resolveIdentity(did);
    handle = doc.handle;
    pdsUrl = doc.pds ?? "";
  } catch {
    // ignore — best-effort hydration
  }

  currentAgent = rpc;
  currentUser = { did, handle, pdsUrl };
  status = "signedIn";
  try {
    localStorage.setItem(CURRENT_DID_KEY, did);
  } catch {
    // ignore
  }
}

// --- Lifecycle ---

/**
 * Idempotent: tries to resume the saved session on first call. Loaders
 * await this before inspecting auth state.
 */
export function ensureAuthReady(): Promise<void> {
  if (!initPromise) initPromise = restoreSession();
  return initPromise;
}

async function restoreSession(): Promise<void> {
  try {
    const did = localStorage.getItem(CURRENT_DID_KEY);
    if (!did) {
      status = "signedOut";
      return;
    }
    const session = await getSession(did as Did, { allowStale: true });
    await adoptUserAgent(new OAuthUserAgent(session));
  } catch (e) {
    console.warn("Could not resume OAuth session:", e);
    status = "signedOut";
  } finally {
    notify();
  }
}

// Kick off init at module load so loaders see something to await.
ensureAuthReady();

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// --- Login flow ---

async function login(handle: string): Promise<void> {
  // Stash where to return to after the OAuth round-trip — but never to
  // /login or /oauth/callback themselves, both of which would loop.
  try {
    const here = window.location.pathname;
    const dest =
      here === "/login" || here.startsWith("/oauth/") ? "/" : here;
    sessionStorage.setItem(POST_LOGIN_KEY, dest);
  } catch {
    // ignore
  }

  const url = await createAuthorizationUrl({
    target: { type: "account", identifier: handle as `${string}.${string}` },
    scope: import.meta.env.VITE_OAUTH_SCOPE,
  });

  // Per atcute docs: small pause so localStorage flushes before navigation.
  await new Promise((r) => setTimeout(r, 200));
  window.location.assign(url);
}

/** One-shot: returns the path stashed before signIn(), then clears it. */
export function takePostLoginRedirect(): string | null {
  try {
    const r = sessionStorage.getItem(POST_LOGIN_KEY);
    sessionStorage.removeItem(POST_LOGIN_KEY);
    return r;
  } catch {
    return null;
  }
}

/**
 * Called by the OAuth callback page. Reads OAuth params (from query string
 * or hash — atproto auth servers use query, atcute's README mentions hash;
 * we accept either), scrubs them, exchanges for a session, and adopts it.
 * Idempotent (StrictMode-safe) via cached promise.
 */
export function completeAuthCallback(): Promise<void> {
  if (callbackPromise) return callbackPromise;
  callbackPromise = (async () => {
    const search = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const params =
      search.get("code") || search.get("error") ? search : hash;
    if (!params.get("code") && !params.get("error")) {
      throw new Error("OAuth callback missing code/error parameter");
    }
    history.replaceState(null, "", location.pathname);

    const { session } = await finalizeAuthorization(params);
    await adoptUserAgent(new OAuthUserAgent(session));
    initPromise = Promise.resolve();
    notify();
  })();
  return callbackPromise;
}

async function logout(): Promise<void> {
  if (currentUser) {
    try {
      const session = await getSession(currentUser.did as Did, {
        allowStale: true,
      });
      await new OAuthUserAgent(session).signOut();
    } catch {
      try {
        deleteStoredSession(currentUser.did as Did);
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(CURRENT_DID_KEY);
    } catch {
      // ignore
    }
  }
  currentUser = null;
  currentAgent = null;
  status = "signedOut";
  notify();
}

// --- React hook ---

// Cached snapshot — useSyncExternalStore relies on Object.is to detect change,
// so we must return a NEW object reference whenever any field changes
// (mutating in place would silently break re-renders).
let cachedSnapshot: AuthSnapshot = {
  status,
  user: currentUser,
  agent: currentAgent,
};
function getSnapshot(): AuthSnapshot {
  if (
    cachedSnapshot.status !== status ||
    cachedSnapshot.user !== currentUser ||
    cachedSnapshot.agent !== currentAgent
  ) {
    cachedSnapshot = { status, user: currentUser, agent: currentAgent };
  }
  return cachedSnapshot;
}

export function useAuth(): UseAuthResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snap, login, logout };
}
