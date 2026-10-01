import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCatalog, useCatalogCategoryTree } from "../model";
import {
  ALL_PRODUCTS,
  FALLBACK_CATALOG_NODES,
  catalogCategorySlug,
  resolveCatalogBrowseTarget,
  type CatalogCategoryNode,
} from "../types";
import type { UiProduct } from "../model";

export type CatalogVm = {
  category: string;
  /** Subcategory resolved from the URL slug (style tiles / legacy links), if any. */
  subcategory: string | null;
  isCategorySelected: boolean;
  categories: readonly string[];
  categoryNodes: readonly CatalogCategoryNode[];
  subcategoriesByCategory: Record<string, readonly string[]>;
  items: UiProduct[];
  /** Product pool for style-carousel tile photos (landing only). */
  stylePreviewProducts: UiProduct[];
  count: number;
  isSkeleton: boolean;
  errorMessage: string | null;
  onCategory: (category: string) => void;
};

/** Controller for the catalog grid: category tabs + per-category product query. */
export function useCatalogController(): CatalogVm {
  const { data: workspace } = useWorkspace();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const categoryTree = useCatalogCategoryTree();
  const categoryNodes = useMemo(() => {
    const remote = categoryTree.data;
    if (remote && remote.length) {
      return remote.map((node) => ({
        name: node.name,
        slug: node.slug,
        children: (node.children ?? []).map((child) => ({ name: child.name, slug: child.slug })),
      }));
    }
    return FALLBACK_CATALOG_NODES;
  }, [categoryTree.data]);
  const rawCategory = params.category ?? searchParams.get("category");
  const isCategorySelected = Boolean(rawCategory && rawCategory.trim() !== "");
  const browse = useMemo(
    () => resolveCatalogBrowseTarget(rawCategory, categoryNodes),
    [rawCategory, categoryNodes],
  );
  const category = browse.category;
  const subcategory = browse.subcategory;
  /** Prefer subcategory (wizard taxonomy), else parent category — matches product tagging. */
  const queryCategory = browse.query;

  const workspaceCatalog = useMemo(
    () =>
      workspace
        ? { items: workspace.catalogProducts, total: workspace.catalogTotal }
        : undefined,
    [workspace],
  );

  const { data, isLoading, isError, error, isFetching } = useCatalog(
    queryCategory,
    isCategorySelected ? workspaceCatalog : undefined,
    isCategorySelected,
  );
  /** Landing carousel: load products so tiles can show subcategory (or Apparel category) photos. */
  const stylePreview = useCatalog(ALL_PRODUCTS, workspaceCatalog, !isCategorySelected);
  const items = data?.items ?? [];
  const stylePreviewProducts = !isCategorySelected
    ? (stylePreview.data?.items ?? workspaceCatalog?.items ?? [])
    : [];
  const categories = useMemo(
    () => [ALL_PRODUCTS, ...categoryNodes.map((node) => node.name)],
    [categoryNodes],
  );
  const subcategoriesByCategory = useMemo(
    () =>
      Object.fromEntries(categoryNodes.map((node) => [node.name, node.children.map((child) => child.name)])),
    [categoryNodes],
  );

  return {
    category,
    subcategory,
    isCategorySelected,
    categories,
    categoryNodes,
    subcategoriesByCategory,
    items,
    stylePreviewProducts,
    count: data?.total ?? items.length,
    isSkeleton: (isLoading || isFetching) && items.length === 0,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load catalog products"
      : null,
    onCategory: (next) => {
      const currentPath = window.location.pathname;
      const basePath = currentPath.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";

      if (next === ALL_PRODUCTS) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("category");
        navigate(
          `${basePath}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`,
          { replace: false },
        );
        return;
      }

      navigate(`${basePath}/category/${catalogCategorySlug(next)}`);
    },
  };
}
