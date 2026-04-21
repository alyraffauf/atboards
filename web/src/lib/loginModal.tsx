import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface LoginModalCtx {
  open: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const LoginModalContext = createContext<LoginModalCtx | null>(null);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);
  const closeLogin = useCallback(() => setOpen(false), []);

  // Open the modal when we land on a URL with ?login=1 (auth-required loader
  // redirects use this), then strip the param so refreshes don't re-trigger.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("login") !== "1") return;
    setOpen(true);
    params.delete("login");
    const remaining = params.toString();
    navigate(location.pathname + (remaining ? `?${remaining}` : ""), {
      replace: true,
    });
  }, [location.pathname, location.search, navigate]);

  return (
    <LoginModalContext.Provider value={{ open, openLogin, closeLogin }}>
      {children}
    </LoginModalContext.Provider>
  );
}

export function useLoginModal(): LoginModalCtx {
  const ctx = useContext(LoginModalContext);
  if (!ctx)
    throw new Error("useLoginModal must be used within LoginModalProvider");
  return ctx;
}
