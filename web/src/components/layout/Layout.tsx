import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import MobileBackButton from "./MobileBackButton";
import Footer from "./Footer";
import ErrorBoundary from "./ErrorBoundary";
import PageSkeleton from "./PageSkeleton";
import LoginModal from "../auth/LoginModal";
import { LoginModalProvider } from "../../lib/loginModal";

export default function Layout() {
  // Remount ErrorBoundary + Suspense on navigation so a fresh page doesn't
  // inherit the previous page's error or fallback state.
  const routeKey = useLocation().pathname;

  return (
    <LoginModalProvider>
      <div className="flex flex-col h-dvh">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8 flex-1 w-full">
          <MobileBackButton />
          <ErrorBoundary key={routeKey}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer />
        <LoginModal />
      </div>
    </LoginModalProvider>
  );
}
