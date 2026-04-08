import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Crumb {
  label: string;
  to?: string;
}

interface Ctx {
  crumbs: Crumb[];
  setCrumbs: (c: Crumb[]) => void;
}

const BreadcrumbCtx = createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return (
    <BreadcrumbCtx.Provider value={{ crumbs, setCrumbs }}>
      {children}
    </BreadcrumbCtx.Provider>
  );
}

export function useBreadcrumbState(): Ctx {
  const ctx = useContext(BreadcrumbCtx);
  if (!ctx) throw new Error("BreadcrumbProvider missing");
  return ctx;
}

/** Pages call this to set the breadcrumb trail. Cleared on unmount. */
export function useBreadcrumb(crumbs: Crumb[], deps: unknown[] = []) {
  const { setCrumbs } = useBreadcrumbState();
  useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
