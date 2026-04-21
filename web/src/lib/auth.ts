/** Browser OAuth for atbbs, backed by atcute. Components use useAuth();
 *  route loaders await ensureAuthReady(). */

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
import type { ActorResolver, ResolvedActor } from "@atcute/identity-resolver";
import type { ActorIdentifier } from "@atcute/lexicons/syntax";
import { resolveIdentity } from "./atproto";

// --- OAuth setup (deferred until config is available) ---

/** Resolves handles via Slingshot so login attempts don't leak to Bluesky. */
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

let oauthConfigured = false;
let oauthScope = "";

async function initOAuth(): Promise<void> {
  if (oauthConfigured) return;

  let clientId: string;
  let redirectUri: string;

  if (import.meta.env.DEV) {
    clientId = import.meta.env.VITE_OAUTH_CLIENT_ID;
    redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI;
    oauthScope = import.meta.env.VITE_OAUTH_SCOPE;
  } else {
    const resp = await fetch("/config.json");
    const config = await resp.json();
    clientId = config.client_id;
    redirectUri = config.redirect_uri;
    oauthScope = config.scope;
  }

  configureOAuth({
    metadata: { client_id: clientId, redirect_uri: redirectUri },
    identityResolver: new SlingshotActorResolver(),
  });
  oauthConfigured = true;
}

// --- Types ---

export interface AuthUser {
  did: string;
  handle: string;
  pdsUrl: string;
}

type Status = "loading" | "signedIn" | "signedOut";

type Did = `did:${string}:${string}`;

const CURRENT_DID_KEY = "atbbs:current-did";
const POST_LOGIN_KEY = "atbbs:post-login-redirect";

// --- Module-level auth state ---
//
// Intentionally outside React so both components (useAuth) and route
// loaders (ensureAuthReady/getCurrentUser) can read it.

let status: Status = "loading";
let currentUser: AuthUser | null = null;
let currentAgent: Client | null = null;

let initPromise: Promise<void> | null = null;
let callbackPromise: Promise<void> | null = null;

// --- Change notification (for useSyncExternalStore) ---

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

function subscribeToChanges(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// --- Internal helpers ---

async function setSignedIn(oauthAgent: OAuthUserAgent) {
  const rpc = new Client({ handler: oauthAgent });
  const did = oauthAgent.sub;

  let handle: string = did;
  let pdsUrl = "";
  try {
    const doc = await resolveIdentity(did);
    handle = doc.handle;
    pdsUrl = doc.pds ?? "";
  } catch {
    // best-effort — falls back to showing the raw DID
  }

  currentAgent = rpc;
  currentUser = { did, handle, pdsUrl };
  status = "signedIn";

  try {
    localStorage.setItem(CURRENT_DID_KEY, did);
  } catch {
    // storage full or blocked — non-fatal
  }
}

function setSignedOut() {
  currentUser = null;
  currentAgent = null;
  status = "signedOut";
}

// --- Session restore (runs on page load) ---

async function restoreSession(): Promise<void> {
  try {
    await initOAuth();
    const did = localStorage.getItem(CURRENT_DID_KEY);
    if (!did) {
      setSignedOut();
      return;
    }
    const session = await getSession(did as Did, { allowStale: true });
    await setSignedIn(new OAuthUserAgent(session));
  } catch (e) {
    console.warn("Could not resume OAuth session:", e);
    setSignedOut();
  } finally {
    notifyListeners();
  }
}

/** Resolves once session restore has been attempted. */
export function ensureAuthReady(): Promise<void> {
  if (!initPromise) initPromise = restoreSession();
  return initPromise;
}

// Start restoring immediately so it's already in flight by the time the
// first loader fires.
ensureAuthReady();

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// --- Login ---

async function login(handle: string): Promise<void> {
  // Remember where to send the user after the OAuth round-trip, but never
  // back to /oauth/callback (that would loop).
  try {
    const here = window.location.pathname;
    const dest = here.startsWith("/oauth/") ? "/" : here;
    sessionStorage.setItem(POST_LOGIN_KEY, dest);
  } catch {
    // non-fatal
  }

  await initOAuth();
  const url = await createAuthorizationUrl({
    target: { type: "account", identifier: handle as `${string}.${string}` },
    scope: oauthScope,
  });

  // Small pause so the browser flushes sessionStorage before navigating.
  await new Promise((r) => setTimeout(r, 200));
  window.location.assign(url);
}

/** Returns (and clears) the path we stashed before the OAuth redirect. */
export function takePostLoginRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_KEY);
    sessionStorage.removeItem(POST_LOGIN_KEY);
    return path;
  } catch {
    return null;
  }
}

// --- OAuth callback ---

/** Exchanges the OAuth code for a session. Safe to call twice (StrictMode). */
export function completeAuthCallback(): Promise<void> {
  if (callbackPromise) return callbackPromise;
  callbackPromise = (async () => {
    await initOAuth();

    const fromQuery = new URLSearchParams(location.search);
    const fromHash = new URLSearchParams(location.hash.slice(1));
    const params =
      fromQuery.get("code") || fromQuery.get("error") ? fromQuery : fromHash;

    if (!params.get("code") && !params.get("error")) {
      throw new Error("OAuth callback missing code/error parameter");
    }

    // Scrub the code from the URL so a refresh doesn't re-exchange.
    history.replaceState(null, "", location.pathname);

    const { session } = await finalizeAuthorization(params);
    await setSignedIn(new OAuthUserAgent(session));
    initPromise = Promise.resolve();
    notifyListeners();
  })();
  return callbackPromise;
}

// --- Logout ---

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
        // non-fatal
      }
    }
    try {
      localStorage.removeItem(CURRENT_DID_KEY);
    } catch {
      // non-fatal
    }
  }
  setSignedOut();
  notifyListeners();
}

// --- React hook ---

interface AuthSnapshot {
  status: Status;
  user: AuthUser | null;
  agent: Client | null;
}

// useSyncExternalStore compares snapshots with Object.is, so we must
// return a NEW object whenever any field changes. If we mutated the same
// object in place, React would never see the change.
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

export function useAuth() {
  const snapshot = useSyncExternalStore(
    subscribeToChanges,
    getSnapshot,
    getSnapshot,
  );
  return { ...snapshot, login, logout };
}
