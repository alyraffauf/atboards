import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 5173;

const SCOPE = [
  "atproto",
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
 * In dev we synthesize a loopback client_id (atproto OAuth forbids `localhost`,
 * so the redirect goes to 127.0.0.1). In `vite build` we require VITE_PUBLIC_URL
 * (e.g. https://atbbs.app) and emit `dist/client-metadata.json` with the real
 * values — there is no source-controlled metadata file to forget to edit.
 */
export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  const publicUrl = process.env.VITE_PUBLIC_URL?.trim();

  let clientId: string;
  let redirectUri: string;
  let prodMetadata: ClientMetadata | null = null;

  if (isBuild) {
    if (!publicUrl || /REPLACE/i.test(publicUrl)) {
      throw new Error(
        "VITE_PUBLIC_URL must be set for production builds " +
          "(e.g. VITE_PUBLIC_URL=https://atbbs.app npm run build).",
      );
    }
    if (!publicUrl.startsWith("https://")) {
      throw new Error(
        `VITE_PUBLIC_URL must use https:// (got ${publicUrl}).`,
      );
    }
    prodMetadata = buildMetadata(publicUrl);
    clientId = prodMetadata.client_id;
    redirectUri = prodMetadata.redirect_uris[0];
  } else {
    redirectUri = `http://${SERVER_HOST}:${SERVER_PORT}/oauth/callback`;
    clientId =
      `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPE)}`;
  }

  process.env.VITE_OAUTH_CLIENT_ID = clientId;
  process.env.VITE_OAUTH_REDIRECT_URI = redirectUri;
  process.env.VITE_OAUTH_SCOPE = SCOPE;

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png}"],
          navigateFallback: "/index.html",
        },
      }),
      {
        name: "atbbs-emit-client-metadata",
        generateBundle() {
          if (prodMetadata) {
            this.emitFile({
              type: "asset",
              fileName: "client-metadata.json",
              source: JSON.stringify(prodMetadata, null, 2) + "\n",
            });
          }
        },
      },
    ],
    server: { host: SERVER_HOST, port: SERVER_PORT },
  };
});
