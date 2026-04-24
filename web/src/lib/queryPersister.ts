import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// Bump when cache shapes change (lexicon edits, query-key restructures) so
// older clients discard incompatible cached data on next load instead of
// deserializing into crashes.
const BUSTER = "atbbs-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;

const persister = createSyncStoragePersister({
  storage: localStorage,
  key: "atbbs:query-cache",
});

export const persistOptions = {
  persister,
  buster: BUSTER,
  maxAge: MAX_AGE,
  dehydrateOptions: {
    // Skip fingerprinted thread-page entries. Their keys churn whenever a
    // reply is added or deleted, so persisting them just bloats localStorage
    // with old-fingerprint garbage. thread-refs is persisted and drives the
    // page rebuild on load.
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] !== "thread-page",
  },
};
