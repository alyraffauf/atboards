import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { BBSNotFoundError, NoBBSError, NetworkError } from "../lib/bbs";

export default function ErrorPage() {
  const error = useRouteError();

  let message = "Something went wrong.";
  if (error instanceof BBSNotFoundError) message = "BBS not found.";
  else if (error instanceof NoBBSError)
    message = "This account isn't running a BBS.";
  else if (error instanceof NetworkError)
    message = "Could not reach the network. Try again.";
  else if (isRouteErrorResponse(error)) message = error.statusText || message;
  else if (error instanceof Error) message = error.message;

  return <p className="text-neutral-500">{message}</p>;
}
