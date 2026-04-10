import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { useBreadcrumbState, type Crumb } from "../hooks/useBreadcrumb";

export default function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigation();
  const navigate = useNavigate();
  const isLoading = nav.state === "loading";

  async function onLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="flex flex-col h-dvh">
      {isLoading && (
        <div
          className="fixed top-0 left-0 right-0 h-0.5 bg-neutral-400 z-50"
          style={{ animation: "atbbs-progress 1.5s ease-out infinite" }}
        />
      )}
      <header className="border-b border-neutral-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500 overflow-x-auto whitespace-nowrap">
            <Link to="/" className="shrink-0 hover:opacity-80">
              <img
                src="/hero.svg"
                alt="@bbs"
                style={{ height: "1.25rem", imageRendering: "pixelated" }}
                className="inline-block"
              />
            </Link>
            <Breadcrumbs />
          </div>
          <div className="shrink-0 ml-4 flex items-center gap-3">
            {user ? (
              <>
                <Link
                  to="/account"
                  className="text-neutral-500 hover:text-neutral-300"
                >
                  {user.handle}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-neutral-500 hover:text-neutral-300"
                >
                  log out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                state={{ from: loc.pathname }}
                className="text-neutral-500 hover:text-neutral-300"
              >
                log in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 flex-1 w-full">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-800 mt-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex items-center justify-between text-xs text-neutral-500">
          <span>
            made by{" "}
            <a
              href="https://aly.codes"
              className="text-neutral-500 hover:text-neutral-300"
            >
              aly.codes
            </a>
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/alyraffauf/atbbs"
              className="text-neutral-500 hover:text-neutral-300"
            >
              github
            </a>
            <a
              href="https://ko-fi.com/alyraffauf"
              className="text-neutral-500 hover:text-neutral-300"
            >
              ko-fi
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Breadcrumbs() {
  const { crumbs } = useBreadcrumbState();
  if (!crumbs.length) return null;
  const out: ReactNode[] = [];
  crumbs.forEach((c: Crumb, i: number) => {
    out.push(<span key={`s${i}`}>/</span>);
    const last = i === crumbs.length - 1;
    if (c.to && !last) {
      out.push(
        <Link
          key={`c${i}`}
          to={c.to}
          className="text-neutral-500 hover:text-neutral-300"
        >
          {c.label}
        </Link>,
      );
    } else {
      out.push(
        <span key={`c${i}`} className="text-neutral-400 truncate">
          {c.label}
        </span>,
      );
    }
  });
  return <>{out}</>;
}
