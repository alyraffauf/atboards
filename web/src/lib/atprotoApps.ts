export interface AtprotoApp {
  name: string;
  url: string;
}

export const ATPROTO_APPS: AtprotoApp[] = [
  { name: "Blacksky", url: "https://blacksky.community" },
  { name: "Bluesky", url: "https://bsky.app" },
  { name: "Grain Social", url: "https://grain.social" },
  { name: "Leaflet", url: "https://leaflet.pub" },
  { name: "pckt.blog", url: "https://pckt.blog" },
  { name: "Streamplace", url: "https://stream.place" },
  { name: "Tangled", url: "https://tangled.sh" },
  { name: "wisp.place", url: "https://wisp.place" },
];

export function pickRandomApps(count: number): AtprotoApp[] {
  const shuffled = [...ATPROTO_APPS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
