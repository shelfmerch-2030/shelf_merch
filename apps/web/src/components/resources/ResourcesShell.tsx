import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Header } from "../landing/Header";
import { RESOURCE_NAV } from "./resources-data";
import "../landing-page.css";
import "./resources.css";

type ResourcesShellProps = {
  title: string;
  tone?: "blue" | "coral" | "mint";
  children: ReactNode;
};

export function ResourcesShell({ title, tone, children }: ResourcesShellProps) {
  const location = useLocation();

  useEffect(() => {
    document.title = title;
    window.scrollTo(0, 0);
  }, [title, location.pathname]);

  return (
    <div className={`shelf-resources${tone ? ` tone-${tone}` : ""}`}>
      <div className="shelf-landing resources-site-header">
        <Header />
      </div>
      {children}
      <footer className="res-footer">
        <Link className="brand" to="/">
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
        <div className="footer-links">
          <Link to="/resources">Resources</Link>
          {RESOURCE_NAV.map((item) => (
            <Link key={item.slug} to={`/resources/${item.slug}`}>
              {item.label}
            </Link>
          ))}
        </div>
        <span>© 2026 Shelf Merch</span>
      </footer>
    </div>
  );
}
