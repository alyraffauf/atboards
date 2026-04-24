import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { resolveIdentity } from "../lib/atproto";
import {
  createBan,
  createHide,
  deleteBan,
  deleteHide,
} from "../lib/writes";
import { alertOnError } from "../lib/alerts";

// Shared ban/unban/hide/unhide mutations
// `ban` accepts either a DID or a handle
export function useModerationMutations() {
  const { agent } = useAuth();

  const ban = useMutation({
    mutationFn: async (identifier: string) => {
      if (!agent) throw new Error("Not signed in");
      const did = identifier.startsWith("did:")
        ? identifier
        : (await resolveIdentity(identifier)).did;
      await createBan(agent, did);
    },
    onError: alertOnError("ban"),
  });

  const unban = useMutation({
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteBan(agent, rkey);
    },
    onError: alertOnError("unban"),
  });

  const hide = useMutation({
    mutationFn: async (uri: string) => {
      if (!agent) throw new Error("Not signed in");
      await createHide(agent, uri);
    },
    onError: alertOnError("hide"),
  });

  const unhide = useMutation({
    mutationFn: async (rkey: string) => {
      if (!agent) throw new Error("Not signed in");
      await deleteHide(agent, rkey);
    },
    onError: alertOnError("unhide"),
  });

  return { ban, unban, hide, unhide };
}
