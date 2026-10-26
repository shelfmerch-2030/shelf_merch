import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import {
  ALL_PRODUCTS,
  catalogCategorySlug,
  pickStyleTileImage,
  type CatalogCategoryChild,
  type CatalogCategoryNode,
} from "../types";
import "./catalog-view.css";
import allProductsImg from "../../../../assets/catalog/apparel-shelfmerch.png";
import apparelImg from "../../../../assets/catalog/apparel-shelfmerch.png";
import accessoriesImg from "../../../../assets/catalog/key-chains.webp";
import technologyImg from "../../../../assets/catalog/technology-shelfmerch.png";
import kitsImg from "../../../../assets/catalog-style-spotlight/kits.png";
import drinkwareImg from "../../../../assets/catalog-style-spotlight/drinkware.png";
import bagsImg from "../../../../assets/catalog-style-spotlight/tote.png";
import officeImg from "../../../../assets/catalog-style-spotlight/notebook.png";
import foodImg from "../../../../assets/catalog-overview/sustainability-new.png";
import homeImg from "../../../../assets/catalog-overview/corporate-gifts.png";

const TILE_FALLBACKS: Record<string, string> = {
  Apparel: apparelImg,
  Accessories: accessoriesImg,
  Stationery: officeImg,
  Bags: bagsImg,
  Drinkware: drinkwareImg,
  "Travel Accessories": bagsImg,
  "Electronics & Gadgets": technologyImg,
  "Office Supplies": officeImg,
  Technology: technologyImg,
  Kitchenware: foodImg,
  "Home Appliances": homeImg,
  Decor: homeImg,
  "Home & Living": homeImg,
  "Food & Beverage": foodImg,
  Kits: kitsImg,
};

/**
 * The API tree starts with three departments (Apparel, Accessories, Home & Living).
 * Shoppers need the categories inside those departments — Stationery, Drinkware, Bags —
 * as the list they scan. A department that only wraps a same-named child (Apparel → Apparel)
 * stays one row, and its product types become the items under the chevron.
 */
function browseCatalogEntries(nodes: readonly CatalogCategoryNode[]): CatalogCategoryChild[] {
  const entries: CatalogCategoryChild[] = [];

  for (const node of nodes) {
    const children = node.children.filter((child) => child.name !== "Others");
    if (children.length === 0) {
      entries.push({ name: node.name, slug: node.slug, children: [] });
      continue;
    }

    const [only] = children;
    if (children.length === 1 && only.name.toLowerCase() === node.name.toLowerCase()) {
      entries.push({
        name: node.name,
        slug: node.slug,
        children: (only.children ?? []).filter((child) => child.name !== "Others"),
      });
      continue;
    }

    entries.push(...children);
  }

  return entries;
}

export function catalogHomePath(pathname: string) {
  const match = pathname.match(/^(.*\/catalog)(?:\/|$)/);
  return match?.[1] ?? "/app/catalog";
}

function CategoryBranch({
  name,
  children,
  home,
  depth,
}: {
  name: string;
  children: readonly CatalogCategoryChild[];
  home: string;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = children.length > 0;
  const href = `${home}/category/${catalogCategorySlug(name)}`;

  return (
    <div className={`sm-browse__branch${open ? " is-open" : ""}`}>
      <div className="sm-browse__row" style={{ paddingLeft: 12 + depth * 14 }}>
        <Link to={href}>{name}</Link>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${name} categories`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open
        ? children.map((child) => (
            <CategoryBranch
              key={child.slug || child.name}
              name={child.name}
              children={child.children ?? []}
              home={home}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

export function CatalogBrowseView({ categoryNodes, stylePreviewProducts }: CatalogVm) {
  const { pathname } = useLocation();
  const home = catalogHomePath(pathname);

  const entries = useMemo(() => browseCatalogEntries(categoryNodes), [categoryNodes]);

  const tiles = useMemo(
    () =>
      entries.map((entry) => ({
        name: entry.name,
        href: `${home}/category/${catalogCategorySlug(entry.name)}`,
        image: pickStyleTileImage(
          stylePreviewProducts,
          entry.name,
          TILE_FALLBACKS[entry.name] ?? apparelImg,
          categoryNodes,
        ),
      })),
    [categoryNodes, entries, home, stylePreviewProducts],
  );

  return (
    <div className="sm-browse">
      <div className="sm-browse__head">
        <p className="sm-browse__crumb">
          <Link to={home}>Home</Link>
          <span aria-hidden="true">/</span>
          Catalog
        </p>
        <h1>Catalog</h1>
      </div>
      <div className="sm-browse__layout">
        <aside className="sm-browse__nav" aria-label="Catalog categories">
          {entries.map((entry) => (
            <CategoryBranch
              key={entry.slug || entry.name}
              name={entry.name}
              children={entry.children ?? []}
              home={home}
              depth={0}
            />
          ))}
        </aside>
        <div className="sm-browse__grid">
          <Link className="sm-browse__tile" to={`${home}/browse`}>
            <span className="sm-browse__media">
              <img src={allProductsImg} alt="" />
            </span>
            <span>{ALL_PRODUCTS}</span>
          </Link>
          {tiles.map((tile) => (
            <Link className="sm-browse__tile" key={tile.name} to={tile.href}>
              <span className="sm-browse__media">
                <img src={tile.image} alt="" />
              </span>
              <span>{tile.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
