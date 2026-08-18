import { useState } from "react";
import { Link } from "react-router";
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
