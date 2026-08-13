import { useState } from "react";
import { Link, useLocation } from "react-router";
import { ResourceDropdown } from "../resources/ResourceDropdown";
import "../resources/resource-nav.css";

function AuthLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <span className={`header-login${className ? ` ${className}` : ""}`}>
      <Link to="/login" onClick={onNavigate}>
        Log in
      </Link>
      <span aria-hidden="true"> / </span>
      <Link to="/signup" onClick={onNavigate}>
        Sign up
      </Link>
    </span>
  );
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const homePrefix = pathname === "/" ? "" : "/";

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="Shelf Merch home" onClick={closeMenu}>
        <img src="/images/logo/shelfmerch-wordmark.png" alt="" className="brand-wordmark" />
      </Link>

      <nav
        className={`nav-links${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        <Link to="/" onClick={closeMenu}>
          Platform
        </Link>
        <ResourceDropdown onNavigate={closeMenu} />
        <Link to="/apps/catalog" onClick={closeMenu}>
          Catalog
        </Link>
        <a href={`${homePrefix}#production`} onClick={closeMenu}>
          About  
        </a>
        <AuthLinks className="mobile-only" onNavigate={closeMenu} />
      </nav>

      <div className="header-end">
        <AuthLinks className="desktop-only" />
        <span className="header-divider desktop-only" aria-hidden="true" />
        <a className="header-cta" href={`${homePrefix}#contact`}>
          Book a demo
        </a>
        <button
          type="button"
          className="menu-button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
