import type { LoaderFunctionArgs } from "react-router-dom";
import { resolveBBS, type BBS } from "../../lib/bbs";
import { getCurrentUser } from "../../lib/auth";
import { fetchPins, findPinRkey } from "../../lib/pins";

export async function bbsLoader({ params }: LoaderFunctionArgs) {
  const handle = params.handle!;
  const bbs = await resolveBBS(handle);

  let pinRkey: string | null = null;
  const user = getCurrentUser();
  if (user) {
    const pins = await fetchPins(user.pdsUrl, user.did);
    pinRkey = findPinRkey(pins, bbs.identity.did);
  }

  return { handle, bbs, pinRkey };
}

export type BBSLoaderData = { handle: string; bbs: BBS; pinRkey: string | null };
