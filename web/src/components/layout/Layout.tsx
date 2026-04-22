import { Outlet, useNavigation } from "react-router-dom";
import Header from "./Header";
import MobileBackButton from "./MobileBackButton";
import Footer from "./Footer";
import LoginModal from "../auth/LoginModal";
import { LoginModalProvider } from "../../lib/loginModal";
import { useRevalidateOnFocus } from "../../hooks/useRevalidateOnFocus";

export default function Layout() {
  const isLoading = useNavigation().state === "loading";
  useRevalidateOnFocus();

  return (
    <LoginModalProvider>
      <div className="flex flex-col h-dvh">
        {isLoading && (
          <div
            className="fixed top-0 left-0 right-0 h-0.5 bg-neutral-400 z-50"
            style={{ animation: "atbbs-progress 1.5s ease-out infinite" }}
          />
        )}
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8 flex-1 w-full">
          <MobileBackButton />
          <Outlet />
        </main>
        <Footer />
        <LoginModal />
      </div>
    </LoginModalProvider>
  );
}
