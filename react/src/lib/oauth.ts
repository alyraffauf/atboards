/**
 * BrowserOAuthClient setup. In dev, falls back to loopback client metadata
 * (the package auto-generates one when given handleResolver only). In prod,
 * point client_id at a deployed /client-metadata.json.
 *
 * To deploy: set VITE_PUBLIC_URL=https://your.domain at build time, then host
 * /client-metadata.json (Vite copies it from /public). Cloudflare Pages, etc.
 */

import { BrowserOAuthClient } from "@atproto/oauth-client-browser";

const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL as string | undefined;

let _client: BrowserOAuthClient | null = null;

export function getOAuthClient(): BrowserOAuthClient {
  if (_client) return _client;

  if (PUBLIC_URL) {
    // Production: load the static client-metadata.json
    _client = new BrowserOAuthClient({
      clientMetadata: {
        client_id: `${PUBLIC_URL}/client-metadata.json`,
        client_name: "atbbs",
        client_uri: PUBLIC_URL,
        redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
        scope: "atproto transition:generic",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      },
      handleResolver: "https://bsky.social",
    });
  } else {
    // Dev: explicit loopback client metadata. Per atproto spec, loopback
    // client_id is `http://localhost` with redirect_uri + scope as query params,
    // and the redirect_uri must use 127.0.0.1 (not "localhost") as the host.
    const redirect = `${window.location.protocol}//${window.location.host}/oauth/callback`;
    const scope = "atproto transition:generic";
    const clientId =
      `http://localhost?redirect_uri=${encodeURIComponent(redirect)}` +
      `&scope=${encodeURIComponent(scope)}`;
    _client = new BrowserOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: "atbbs (dev)",
        redirect_uris: [redirect],
        scope,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      },
      handleResolver: "https://bsky.social",
    });
  }
  return _client;
}
