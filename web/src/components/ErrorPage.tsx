import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { BBSNotFoundError, NoBBSError, NetworkError } from "../lib/bbs";
import { useAuth } from "../lib/auth";
import { ActionLink } from "./nav/ActionButton";

export default function ErrorPage() {
  const error = useRouteError();
  const { user } = useAuth();

  let title = "Something went wrong.";
  let detail: string | null = null;
  let action: { to: string; label: string } = {
    to: "/",
    label: "← back to home",
  };

  if (error instanceof BBSNotFoundError) {
    title = "BBS not found.";
    detail = "Couldn't resolve that handle. Double-check the spelling.";
  } else if (error instanceof NoBBSError) {
    title = "No BBS here.";
    if (user) {
      detail = "This account isn't running a BBS yet.";
    } else {
      detail =
        "This account isn't running a BBS yet. Is this you? Log in to start one.";
      action = { to: "/?login=1", label: "log in" };
    }
  } else if (error instanceof NetworkError) {
    title = "Couldn't reach the network.";
    detail = "Try again in a moment.";
  } else if (isRouteErrorResponse(error)) {
    if (error.status === 404) title = "Not found.";
    else title = error.statusText || `Error ${error.status}`;
    if (typeof error.data === "string") detail = error.data;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="py-16 text-center">
      <h1 className="text-lg text-neutral-200 mb-2">{title}</h1>
      {detail && <p className="text-neutral-400 mb-6">{detail}</p>}
      <ActionLink to={action.to}>{action.label}</ActionLink>
    </div>
  );
}
