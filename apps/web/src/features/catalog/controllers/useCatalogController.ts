import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCatalog, useCatalogCategoryTree } from "../model";
import {
  ALL_PRODUCTS,
  FALLBACK_CATALOG_NODES,
  catalogCategorySlug,
  resolveCatalogCategory,
} from "../types";
import type { UiProduct } from "../model";

export type CatalogVm = {
  category: string;
  isCategorySelected: boolean;
  categories: readonly string[];
  subcategoriesByCategory: Record<string, readonly string[]>;
  items: UiProduct[];
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
  const category = resolveCatalogCategory(rawCategory, categoryNodes);

  const seed = useMemo(() => {
    if (!isCategorySelected) return undefined;
    return workspace
      ? { items: workspace.catalogProducts, total: workspace.catalogTotal }
      : undefined;
  }, [workspace, isCategorySelected]);

  const { data, isLoading, isError, error, isFetching } = useCatalog(
    category,
    seed,
    isCategorySelected,
  );
  const items = data?.items ?? [];
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
    isCategorySelected,
    categories,
    subcategoriesByCategory,
    items,
    count: data?.total ?? items.length,
    isSkeleton: (isLoading || isFetching) && items.length === 0,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load catalog products"
      : null,
    onCategory: (next) => {
      const currentPath = window.location.pathname;
      const isPublic = currentPath.startsWith("/apps/catalog") || currentPath.startsWith("/app/catalog");
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
