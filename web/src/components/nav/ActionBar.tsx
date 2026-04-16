import type { ReactNode } from "react";

interface ActionBarProps {
  children: ReactNode;
}

export default function ActionBar({ children }: ActionBarProps) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
