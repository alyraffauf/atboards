// Type guards for narrowing raw ATRecord.value into typed lexicon records.
// Each guard runs the schema's runtime check and, if it passes, narrows the
// record so downstream code can access typed fields without `as unknown as ...`
// casts.

import { is } from "@atcute/lexicons/validations";
import { mainSchema as postSchema } from "../lexicons/types/xyz/atbbs/post";
import { mainSchema as banSchema } from "../lexicons/types/xyz/atbbs/ban";
import { mainSchema as hideSchema } from "../lexicons/types/xyz/atbbs/hide";
import { mainSchema as pinSchema } from "../lexicons/types/xyz/atbbs/pin";
import { mainSchema as profileSchema } from "../lexicons/types/xyz/atbbs/profile";
import { mainSchema as siteSchema } from "../lexicons/types/xyz/atbbs/site";
import { mainSchema as boardSchema } from "../lexicons/types/xyz/atbbs/board";
import type {
  XyzAtbbsBan,
  XyzAtbbsBoard,
  XyzAtbbsHide,
  XyzAtbbsPin,
  XyzAtbbsPost,
  XyzAtbbsProfile,
  XyzAtbbsSite,
} from "../lexicons";
import type { ATRecord } from "./atproto";

export type TypedRecord<T> = Omit<ATRecord, "value"> & { value: T };

export type PostRecord = TypedRecord<XyzAtbbsPost.Main>;
export type BanRecord = TypedRecord<XyzAtbbsBan.Main>;
export type HideRecord = TypedRecord<XyzAtbbsHide.Main>;
export type PinRecord = TypedRecord<XyzAtbbsPin.Main>;
export type ProfileRecord = TypedRecord<XyzAtbbsProfile.Main>;
export type SiteRecord = TypedRecord<XyzAtbbsSite.Main>;
export type BoardRecord = TypedRecord<XyzAtbbsBoard.Main>;

export function isPostRecord(record: ATRecord): record is PostRecord {
  return is(postSchema, record.value);
}

export function isBanRecord(record: ATRecord): record is BanRecord {
  return is(banSchema, record.value);
}

export function isHideRecord(record: ATRecord): record is HideRecord {
  return is(hideSchema, record.value);
}

export function isPinRecord(record: ATRecord): record is PinRecord {
  return is(pinSchema, record.value);
}

export function isProfileRecord(record: ATRecord): record is ProfileRecord {
  return is(profileSchema, record.value);
}

export function isSiteRecord(record: ATRecord): record is SiteRecord {
  return is(siteSchema, record.value);
}

export function isBoardRecord(record: ATRecord): record is BoardRecord {
  return is(boardSchema, record.value);
}
