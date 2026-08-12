import { useState } from "react";
import { ArrowIcon } from "./icons";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header className="site-header">
      <a href="#top" className="brand" aria-label="Shelf Merch home">
        <span className="brand-mark">S</span>
        <span>
          SHELF
          <br />
          MERCH
        </span>
      </a>
      <nav
        className={`nav-links${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        <a href="#platform" onClick={closeMenu}>
          Platform
        </a>
        <a href="#solutions" onClick={closeMenu}>
          Solutions
        </a>
        <a href="#catalog" onClick={closeMenu}>
          Catalog
        </a>
        <a href="#production" onClick={closeMenu}>
          How it works
        </a>
      </nav>
      <a className="header-cta" href="#contact">
        Book a demo <ArrowIcon width={17} height={17} />
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
    </header>
  );
}
