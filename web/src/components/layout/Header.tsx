import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import Logo from "./Logo";
import HeaderBreadcrumbs from "./HeaderBreadcrumbs";
import MobileMenu from "./MobileMenu";

const linkStyle = "text-neutral-500 hover:text-neutral-300";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="border-b border-neutral-800">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="hidden md:flex items-center gap-2 text-neutral-500 min-w-0 whitespace-nowrap">
          <Logo />
          <HeaderBreadcrumbs />
        </div>
        <div className="md:hidden">
          <Logo />
        </div>
        <div className="hidden md:flex items-center gap-3 shrink-0 ml-4">
          {user ? (
            <>
              <Link to="/account" className={linkStyle}>{user.handle}</Link>
              <button type="button" onClick={onLogout} className={linkStyle}>log out</button>
            </>
          ) : (
            <Link to="/login" className={linkStyle}>log in</Link>
          )}
        </div>
        <MobileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
