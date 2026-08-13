import { Link, useLocation } from "react-router";
import { RESOURCE_NAV } from "./resources-data";

type ResourceDropdownProps = {
  onNavigate?: () => void;
};

export function ResourceDropdown({ onNavigate }: ResourceDropdownProps) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith("/resources");

  return (
    <div className="resources-dropdown">
      <Link
        className={`resources-trigger${isActive ? " active" : ""}`}
        to="/resources"
        onClick={onNavigate}
      >
        Resources <span>⌄</span>
      </Link>
      <div className="resources-menu">
        <small>BY TEAM</small>
        {RESOURCE_NAV.map((item) => (
          <Link key={item.slug} to={`/resources/${item.slug}`} onClick={onNavigate}>
            <i>{item.icon}</i>
            <span>
              <b>{item.label}</b>
              <em>{item.blurb}</em>
            </span>
            <strong>↗</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
