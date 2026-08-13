import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import "@/components/landing-page.css";

export function PublicCatalogLayout() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Catalog — Shelf Merch";
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  return (
    <div className="public-catalog">
      <div className="shelf-landing public-catalog-chrome">
        <Header />
      </div>
      <main className="public-catalog-main wrap">
        <Outlet />
      </main>
      <div className="shelf-landing public-catalog-chrome">
        <Footer />
      </div>
    </div>
  );
}
