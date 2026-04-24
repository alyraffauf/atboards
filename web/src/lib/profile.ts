/** Fetch a user's atbbs profile and BBS info. */

import { getAvatar, getRecord, resolveIdentity } from "./atproto";
import { PROFILE, SITE } from "./lexicon";
import { isProfileRecord, isSiteRecord } from "./recordGuards";

export interface Profile {
  did: string;
  handle: string;
  pdsUrl: string;
  avatar?: string;
  name?: string;
  pronouns?: string;
  bio?: string;
  bbsName?: string;
  bbsDescription?: string;
  createdAt?: string;
}

export async function fetchProfile(handle: string): Promise<Profile | null> {
  let identity;
  try {
    identity = await resolveIdentity(handle);
  } catch {
    return null;
  }

  const [[profileResult, siteResult], avatar] = await Promise.all([
    Promise.allSettled([
      getRecord(identity.did, PROFILE, "self"),
      getRecord(identity.did, SITE, "self"),
    ]),
    getAvatar(identity.did),
  ]);

  const profile: Profile = {
    did: identity.did,
    handle: identity.handle,
    pdsUrl: identity.pds ?? "",
    avatar,
  };

  if (
    profileResult.status === "fulfilled" &&
    isProfileRecord(profileResult.value)
  ) {
    const value = profileResult.value.value;
    profile.name = value.name;
    profile.pronouns = value.pronouns;
    profile.bio = value.bio;
    profile.createdAt = value.createdAt;
  }

  if (
    siteResult.status === "fulfilled" &&
    isSiteRecord(siteResult.value)
  ) {
    const value = siteResult.value.value;
    profile.bbsName = value.name;
    profile.bbsDescription = value.description;
  }

  return profile;
}
