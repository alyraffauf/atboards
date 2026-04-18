# OpenGraph Worker

Cloudflare Worker that injects dynamic `og:title`, `og:description`, `og:image`, and `og:url` into the atbbs SPA for link previews on social platforms.

Handles two route patterns:

- `/bbs/*` — rewrites the HTML `<meta>` tags with BBS/board/thread metadata from Slingshot
- `/og/bbs/*.png` — generates a branded 1200x630 preview image on the fly

## Deploy

```bash
cd opengraph
npm install
npx wrangler login
npx wrangler deploy -c wrangler.toml
```

Requires `atbbs.xyz` to be proxied through Cloudflare.
