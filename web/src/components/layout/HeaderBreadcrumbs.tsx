import { Link } from "react-router-dom";
import { useBreadcrumbState } from "../../hooks/useBreadcrumb";

export default function HeaderBreadcrumbs() {
  const { crumbs } = useBreadcrumbState();
  if (!crumbs.length) return null;

  return (
    <>
      {crumbs.flatMap((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const separator = <span key={`sep-${index}`}>/</span>;
        const element =
          crumb.to && !isLast ? (
            <Link
              key={`crumb-${index}`}
              to={crumb.to}
              className="text-neutral-500 hover:text-neutral-300"
            >
              {crumb.label}
            </Link>
          ) : (
            <span
              key={`crumb-${index}`}
              className="text-neutral-400 truncate"
            >
              {crumb.label}
            </span>
          );
        return [separator, element];
      })}
    </>
  );
}
