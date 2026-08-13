import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="brand footer-brand">
        <span className="brand-mark">S</span>
        <span>
          SHELF
          <br />
          MERCH
        </span>
      </Link>
      <p>
        Merch. Gifting. Recognition.
        <br />
        Made and delivered across India.
      </p>
      <div>
        <Link to="/">Platform</Link>
        <Link to="/resources">Resources</Link>
        <Link to="/apps/catalog">Catalog</Link>
        <Link to="/#contact">Contact</Link>
      </div>
      <span>© 2026 Shelf Merch</span>
    </footer>
  );
}
