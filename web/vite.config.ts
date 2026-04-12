import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 5173;

const SCOPE = [
  "atproto",
  "blob:*/*",
  "repo:xyz.atboards.site",
  "repo:xyz.atboards.board",
  "repo:xyz.atboards.news",
  "repo:xyz.atboards.thread",
  "repo:xyz.atboards.reply",
  "repo:xyz.atboards.ban",
  "repo:xyz.atboards.hide",
].join(" ");

interface ClientMetadata {
  client_id: string;
  client_name: string;
  client_uri: string;
  redirect_uris: [string];
  scope: string;
  grant_types: ["authorization_code", "refresh_token"];
  response_types: ["code"];
  token_endpoint_auth_method: "none";
  application_type: "web";
  dpop_bound_access_tokens: true;
}

function buildMetadata(publicUrl: string): ClientMetadata {
  const u = publicUrl.replace(/\/$/, "");
  return {
    client_id: `${u}/client-metadata.json`,
    client_name: "atbbs",
    client_uri: u,
    redirect_uris: [`${u}/oauth/callback`],
    scope: SCOPE,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
  };
}

/**
 * Dev: synthesizes a loopback client_id (atproto OAuth forbids `localhost`,
 * so the redirect goes to 127.0.0.1).
 *
 * Build with VITE_PUBLIC_URL: emits config.json + client-metadata.json for
 * static deploys (Cloudflare Pages, etc.).
 *
 * Build without VITE_PUBLIC_URL: produces a generic bundle. The Docker
 * entrypoint generates config.json + client-metadata.json at runtime from
 * the PUBLIC_URL env var.
 */
export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  const publicUrl = process.env.VITE_PUBLIC_URL?.trim();

  if (!isBuild) {
    // Dev: set env vars for the loopback OAuth flow.
    const redirectUri = `http://${SERVER_HOST}:${SERVER_PORT}/oauth/callback`;
    process.env.VITE_OAUTH_CLIENT_ID =
      `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPE)}`;
    process.env.VITE_OAUTH_REDIRECT_URI = redirectUri;
    process.env.VITE_OAUTH_SCOPE = SCOPE;
  }

  // Static deploy: emit config.json and client-metadata.json at build time.
  let staticFiles: Array<{ fileName: string; source: string }> = [];
  if (isBuild && publicUrl) {
    if (!publicUrl.startsWith("https://")) {
      throw new Error(
        `VITE_PUBLIC_URL must use https:// (got ${publicUrl}).`,
      );
    }
    const u = publicUrl.replace(/\/$/, "");
    const metadata = buildMetadata(u);
    staticFiles = [
      {
        fileName: "client-metadata.json",
        source: JSON.stringify(metadata, null, 2) + "\n",
      },
      {
        fileName: "config.json",
        source:
          JSON.stringify(
            {
              client_id: metadata.client_id,
              redirect_uri: metadata.redirect_uris[0],
              scope: SCOPE,
            },
            null,
            2,
          ) + "\n",
      },
    ];
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "atbbs-emit-static-config",
        generateBundle() {
          for (const f of staticFiles) {
            this.emitFile({ type: "asset", ...f });
          }
        },
      },
    ],
    server: { host: SERVER_HOST, port: SERVER_PORT },
  };
});
