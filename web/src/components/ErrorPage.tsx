import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { BBSNotFoundError, NoBBSError, NetworkError } from "../lib/bbs";
import { ActionLink } from "./nav/ActionButton";

export default function ErrorPage() {
  const error = useRouteError();

  let title = "Something went wrong.";
  let detail: string | null = null;

  if (error instanceof BBSNotFoundError) {
    title = "BBS not found.";
    detail = "Couldn't resolve that handle. Double-check the spelling.";
  } else if (error instanceof NoBBSError) {
    title = "No BBS here.";
    detail = "This account isn't running a BBS yet.";
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
      {detail && <p className="text-neutral-500 mb-6">{detail}</p>}
      <ActionLink to="/">← back to home</ActionLink>
    </div>
  );
}
