import { ImageResponse, loadGoogleFont } from "workers-og";
import heroLogoSvg from "./hero-light.svg";

const SLINGSHOT_URL = "https://slingshot.microcosm.blue/xrpc";

const DEFAULT_TITLE = "atbbs";
const DEFAULT_DESCRIPTION = "Decentralized forums on the AT Protocol.";

// Tailwind neutral palette — matches the site's light theme.
const COLORS = {
  background: "#fafafa",  // neutral-50
  title: "#171717",       // neutral-900
  subtitle: "#525252",    // neutral-600
  description: "#525252", // neutral-600
};

// Types

interface Route {
  type: "bbs" | "board" | "thread" | "news";
  handle: string;
  slug?: string;
  did?: string;
  rkey?: string;
}

interface Metadata {
  title: string;
  subtitle: string;
  description: string;
}

interface SlingshotIdentity {
  did: string;
  handle: string;
  pds?: string;
}

interface SlingshotRecord {
  uri: string;
  cid: string;
  value: Record<string, string>;
}

// Utils

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

// Slingshot

async function resolveIdentity(
  handle: string,
): Promise<SlingshotIdentity | null> {
  const response = await fetch(
    `${SLINGSHOT_URL}/blue.microcosm.identity.resolveMiniDoc?identifier=${encodeURIComponent(handle)}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as SlingshotIdentity;
}

async function fetchRecord(
  did: string,
  collection: string,
  recordKey: string,
): Promise<SlingshotRecord | null> {
  const response = await fetch(
    `${SLINGSHOT_URL}/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(recordKey)}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as SlingshotRecord;
}

async function fetchSiteName(did: string, fallback: string): Promise<string> {
  const siteRecord = await fetchRecord(did, "xyz.atbbs.site", "self");
  return siteRecord ? siteRecord.value.name : fallback;
}

// --- Route parsing ---

function parseRoute(path: string): Route | null {
  // Strip /og prefix and .png suffix so this works for both HTML and image routes.
  const normalizedPath = path.replace(/^\/og/, "").replace(/\.png$/, "");

  const bbsMatch = normalizedPath.match(/^\/bbs\/([^/]+)$/);
  if (bbsMatch) return { type: "bbs", handle: bbsMatch[1] };

  const boardMatch = normalizedPath.match(/^\/bbs\/([^/]+)\/board\/([^/]+)$/);
  if (boardMatch)
    return { type: "board", handle: boardMatch[1], slug: boardMatch[2] };

  const threadMatch = normalizedPath.match(
    /^\/bbs\/([^/]+)\/thread\/([^/]+)\/([^/]+)$/,
  );
  if (threadMatch)
    return {
      type: "thread",
      handle: threadMatch[1],
      did: threadMatch[2],
      rkey: threadMatch[3],
    };

  const newsMatch = normalizedPath.match(/^\/bbs\/([^/]+)\/news\/([^/]+)$/);
  if (newsMatch)
    return { type: "news", handle: newsMatch[1], rkey: newsMatch[2] };

  return null;
}

// Metadata

async function fetchMetadata(route: Route): Promise<Metadata | null> {
  const identity = await resolveIdentity(route.handle);
  if (!identity) return null;

  if (route.type === "bbs") {
    const siteRecord = await fetchRecord(
      identity.did,
      "xyz.atbbs.site",
      "self",
    );
    if (siteRecord) {
      return {
        title: siteRecord.value.name,
        subtitle: "",
        description: siteRecord.value.description || "",
      };
    }
  } else if (route.type === "board") {
    const siteName = await fetchSiteName(identity.did, route.handle);
    const boardRecord = await fetchRecord(
      identity.did,
      "xyz.atbbs.board",
      route.slug!,
    );
    if (boardRecord) {
      return {
        title: boardRecord.value.name,
        subtitle: siteName,
        description: boardRecord.value.description || "",
      };
    }
  } else if (route.type === "thread") {
    const siteName = await fetchSiteName(identity.did, route.handle);
    const postRecord = await fetchRecord(
      route.did!,
      "xyz.atbbs.post",
      route.rkey!,
    );
    if (postRecord) {
      return {
        title: postRecord.value.title || "Thread",
        subtitle: siteName,
        description: postRecord.value.body || "",
      };
    }
  } else if (route.type === "news") {
    const siteName = await fetchSiteName(identity.did, route.handle);
    const postRecord = await fetchRecord(
      identity.did,
      "xyz.atbbs.post",
      route.rkey!,
    );
    if (postRecord) {
      return {
        title: postRecord.value.title || "News",
        subtitle: siteName,
        description: postRecord.value.body || "",
      };
    }
  }

  return null;
}

// Generate OG Images

const HERO_LOGO_DATA_URI =
  "data:image/svg+xml," + encodeURIComponent(heroLogoSvg);

async function renderOgImage(
  title: string,
  subtitle: string,
  description: string,
): Promise<Response> {
  const displayTitle = escapeHtml(truncate(title, 40));
  const displaySubtitle = escapeHtml(subtitle);
  const displayDescription = escapeHtml(truncate(description, 120));

  const fontData = await loadGoogleFont({
    family: "Geist Mono",
    weight: 400,
  });

  const subtitleHtml = displaySubtitle
    ? `<div style="display: flex; font-size: 24px; color: ${COLORS.subtitle}; font-family: 'Geist Mono';">${displaySubtitle}</div>`
    : "";

  const html = `
    <div style="display: flex; flex-direction: column; justify-content: space-between; width: 1200px; height: 630px; background-color: ${COLORS.background}; padding: 80px 90px;">
      <img src="${HERO_LOGO_DATA_URI}" width="276" height="84" style="image-rendering: pixelated;" />
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${subtitleHtml}
        <div style="display: flex; font-size: 56px; color: ${COLORS.title}; font-family: 'Geist Mono'; line-height: 1.2;">${displayTitle}</div>
        <div style="display: flex; font-size: 22px; color: ${COLORS.description}; font-family: 'Geist Mono'; line-height: 1.4;">${displayDescription}</div>
      </div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Geist Mono",
        data: fontData,
        style: "normal",
        weight: 400,
      },
    ],
  });
}

// Inject HTML

function injectMetadata(
  html: string,
  title: string,
  description: string,
  pageUrl: string,
  imageUrl: string,
): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description.substring(0, 200));
  const safePageUrl = escapeHtml(pageUrl);
  const safeImageUrl = escapeHtml(imageUrl);

  html = html.replace(
    "<title>atbbs</title>",
    `<title>${safeTitle}</title>`,
  );
  html = html.replace(
    '<meta property="og:title" content="atbbs" />',
    `<meta property="og:title" content="${safeTitle}" />`,
  );
  html = html.replace(
    '<meta property="og:description" content="Decentralized forums on the AT Protocol." />',
    `<meta property="og:description" content="${safeDescription}" />`,
  );
  html = html.replace(
    '<meta property="og:image" content="/og.png" />',
    `<meta property="og:image" content="${safeImageUrl}" />`,
  );

  if (!html.includes("og:url")) {
    html = html.replace(
      '<meta property="og:type"',
      `<meta property="og:url" content="${safePageUrl}" />\n    <meta property="og:type"`,
    );
  }

  return html;
}

// Entry point

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Dynamic og:image at /og/bbs/... — cached at the edge for 1 hour.
    if (path.startsWith("/og/bbs/")) {
      const cache = caches.default;
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const route = parseRoute(path);
      let imageResponse: Response;

      try {
        const metadata = route ? await fetchMetadata(route) : null;
        imageResponse = metadata
          ? await renderOgImage(metadata.title, metadata.subtitle, metadata.description)
          : await renderOgImage(DEFAULT_TITLE, "", DEFAULT_DESCRIPTION);
      } catch {
        imageResponse = await renderOgImage(DEFAULT_TITLE, "", DEFAULT_DESCRIPTION);
      }

      const cachedCopy = new Response(imageResponse.body, imageResponse);
      cachedCopy.headers.set("Cache-Control", "public, max-age=3600");
      await cache.put(request, cachedCopy.clone());
      return cachedCopy;
    }

    // Inject metadata into HTML for /bbs/... routes.
    const route = parseRoute(path);
    const originResponse = await fetch(request);
    const contentType = originResponse.headers.get("content-type") || "";

    if (!route || !contentType.includes("text/html")) {
      return originResponse;
    }

    let html = await originResponse.text();

    try {
      const metadata = await fetchMetadata(route);
      if (metadata) {
        const fullTitle = metadata.subtitle
          ? `${metadata.title} \u2014 ${metadata.subtitle}`
          : metadata.title;
        const imageUrl = `${url.origin}/og${path}.png`;
        html = injectMetadata(
          html,
          fullTitle,
          metadata.description,
          url.toString(),
          imageUrl,
        );
      }
    } catch {
      // On any error, serve the original HTML unmodified.
    }

    return new Response(html, {
      status: originResponse.status,
      headers: originResponse.headers,
    });
  },
};
