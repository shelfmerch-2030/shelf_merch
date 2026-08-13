import { useState } from "react";
import { Link } from "react-router";

const NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#solutions", label: "Solutions" },
  { href: "#catalog", label: "Catalog" },
  { href: "#production", label: "How it works" },
] as const;

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
      <a href="#top" className="brand" aria-label="Shelf Merch home">
        <img
          className="brand-wordmark"
          src="/images/logo/shelf-merch-wordmark.png"
          alt="Shelf Merch"
          height={28}
        />
      </a>

      <nav
        className={`nav-links${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={closeMenu}>
            {link.label}
          </a>
        ))}
        <AuthLinks className="mobile-only" onNavigate={closeMenu} />
      </nav>

      <div className="header-end">
        <AuthLinks className="desktop-only" />
        <span className="header-divider desktop-only" aria-hidden="true" />
        <a className="header-cta" href="#contact">
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
