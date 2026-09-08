import { useEffect, useState } from "react";
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
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="Shelf Merch home" onClick={closeMenu}>
        <img src="/images/logo/shelfmerch-wordmark.png" alt="" className="brand-wordmark" />
      </Link>

      <nav
        id="site-navigation"
        className={`nav-links${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        <a href="/platform" onClick={closeMenu}>
          Platform
        </a>
        <ResourceDropdown onNavigate={closeMenu} />
        <Link to="/app/catalog" onClick={closeMenu}>
          Catalog
        </Link>
        <a href="/about" onClick={closeMenu}>
          About
        </a>
        <AuthLinks className="mobile-only" onNavigate={closeMenu} />
      </nav>

      <div className="header-end">
        {/* <AuthLinks className="desktop-only" /> */}
        {/* <span className="header-divider desktop-only" aria-hidden="true" /> */}
        <Link className="header-cta" to="/request-demo" onClick={closeMenu}>
          Book a demo
        </Link>
        <button
          type="button"
          className="menu-button"
          aria-label="Toggle menu"
          aria-controls="site-navigation"
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
