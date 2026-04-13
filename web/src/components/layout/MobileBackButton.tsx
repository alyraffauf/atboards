import { Link } from "react-router-dom";
import { useBreadcrumbState } from "../../hooks/useBreadcrumb";

export default function MobileBackButton() {
  const { crumbs } = useBreadcrumbState();
  if (crumbs.length <= 1) return null;
  const parent = crumbs[crumbs.length - 2];
  if (!parent?.to) return null;

  return (
    <Link
      to={parent.to}
      className="md:hidden inline-block mb-6 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs"
    >
      ← {parent.label}
    </Link>
  );
}
