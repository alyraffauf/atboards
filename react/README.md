# atboards (React SPA)

A static SPA reimplementation of the atboards web UI. No server, no database — all reads go directly to Slingshot/Constellation, all writes go directly to the user's PDS via atproto OAuth (DPoP). Designed to be hosted as static files on Cloudflare Pages or any static host.

## Stack

- **Vite + React 19 + TypeScript**
- **react-router-dom v7** (history routing)
- **`@atproto/oauth-client-browser`** for OAuth (same library red-dwarf uses)
- **`@atproto/api`** `Agent` for authenticated XRPC writes
- **Tailwind CSS v4** (via `@tailwindcss/vite`)

All reads (boards, threads, replies, news, bans, hides, identity resolution) go through public Microcosm services:

- `slingshot.microcosm.blue` — getRecord, listRecords, resolveMiniDoc
- `constellation.microcosm.blue` — getBacklinks (used to find threads in a board, replies to a thread, news for a site, quotes of a reply)
- `ufos-api.microcosm.blue` — random BBS discovery on the home page

All writes go to `agent.com.atproto.repo.{createRecord, putRecord, deleteRecord, uploadBlob}` against the user's PDS, using the OAuth/DPoP session held by `@atproto/oauth-client-browser`.

## Layout

```
react/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/
│   ├── client-metadata.json    # OAuth client metadata for production (edit before deploy)
│   ├── _redirects              # Cloudflare Pages SPA fallback
│   ├── favicon.svg
│   └── hero.svg
└── src/
    ├── main.tsx                # Root, BrowserRouter + AuthProvider
    ├── App.tsx                 # Routes
    ├── index.css               # Tailwind entry
    ├── components/
    │   ├── Layout.tsx          # Header / footer / breadcrumb
    │   └── Localtime.tsx
    ├── lib/
    │   ├── lexicon.ts          # xyz.atboards.* collection IDs
    │   ├── util.ts             # date / AT-URI helpers
    │   ├── atproto.ts          # Slingshot + Constellation read wrappers
    │   ├── bbs.ts              # `resolveBBS()` — port of core/resolver.py
    │   ├── oauth.ts            # BrowserOAuthClient setup
    │   ├── auth.tsx            # AuthProvider / useAuth() hook
    │   └── writes.ts           # PDS write helpers (createThread, createReply, …)
    └── pages/
        ├── Home.tsx
        ├── Login.tsx
        ├── Callback.tsx        # /oauth/callback (no logic — provider handles it)
        ├── Site.tsx            # /bbs/:handle
        ├── Board.tsx           # /bbs/:handle/board/:slug
        ├── Thread.tsx          # /bbs/:handle/thread/:did/:tid
        ├── Account.tsx         # /account (inbox + BBS controls)
        ├── SysopCreate.tsx     # /account/create
        ├── SysopEdit.tsx       # /account/edit
        ├── SysopModerate.tsx   # /account/moderate
        └── NotFound.tsx
```

## Routes

Mirror the Python app exactly:

| Route                            | Page          |
|---------------------------------|---------------|
| `/`                              | Home          |
| `/login`                         | Login         |
| `/oauth/callback`                | Callback      |
| `/account`                       | Account       |
| `/account/create`                | SysopCreate   |
| `/account/edit`                  | SysopEdit     |
| `/account/moderate`              | SysopModerate |
| `/bbs/:handle`                   | Site          |
| `/bbs/:handle/board/:slug`       | Board         |
| `/bbs/:handle/thread/:did/:tid`  | Thread        |

The old `/api/threads/...` and `/api/replies/...` JSON endpoints are gone — pages do the same aggregation client-side via `lib/atproto.ts`.

## Development

```sh
cd react
npm install
npm run dev
```

For OAuth in dev, `BrowserOAuthClient` automatically falls back to a **loopback client** when no `clientMetadata` is provided. This works for `http://localhost:5173` without any tunneling — the client_id becomes `http://localhost/?...` and atproto auth servers accept it.

## Production deployment (Cloudflare Pages)

1. Edit `public/client-metadata.json` and replace every `REPLACE_WITH_YOUR_DOMAIN` with your deployed origin (e.g. `https://atbbs.app`).
2. Set the build env var `VITE_PUBLIC_URL=https://atbbs.app` so `lib/oauth.ts` uses the production metadata path.
3. `npm run build` — outputs static files to `dist/`.
4. Deploy `dist/` to Pages. The included `public/_redirects` makes Pages serve `index.html` for all routes (history routing).
5. Verify `https://your.domain/client-metadata.json` is publicly fetchable — that URL is your `client_id`, atproto auth servers will fetch it during the OAuth handshake.

## Auth flow

1. User hits `/login`, types handle, presses log in.
2. `useAuth().login(handle)` → `BrowserOAuthClient.signIn(handle)` → DPoP keypair generated, PAR pushed, browser redirected to the user's authserver.
3. Authserver redirects back to `/oauth/callback?code=…&state=…`.
4. The `AuthProvider` runs `client.init()` on every mount; on the callback page that detects the code, exchanges it, and returns a `OAuthSession`.
5. We wrap that session in an `Agent` and stash `{did, handle, pdsUrl}` in context.
6. Session/refresh tokens are persisted by the OAuth client in IndexedDB; reloads silently restore the session.

## Visual parity

Tailwind classes are copied verbatim from the Jinja templates; the dark neutral theme, Geist Mono font, hero SVG, header/footer layout, and `.reply-card`/`.reply-actions` hover behavior all carry over. Anything that looked a particular way in the Python app should look identical here.

## Things that are intentionally different

- The old write routes returned redirects; the SPA writes records directly via the Agent and updates state in-place (no full-page reloads except where the old TS already did them).
- The thread page used to have a server-paginated reply API. Now it fetches all backlink refs once (limit 1000), then hydrates per-page client-side — same behavior as before, just no intermediate API.
- News deletion / thread deletion / reply deletion happen via `agent.com.atproto.repo.deleteRecord` directly.
- "Delete BBS" walks the user's repo client-side (boards, news, bans, hides, then site).
