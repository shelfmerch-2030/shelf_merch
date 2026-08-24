import { useParams } from "react-router";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCatalogProduct } from "../model";
import type { UiProduct } from "../model";

export type CatalogProductVm = {
  isLoading: boolean;
  errorMessage: string | null;
  product: UiProduct | undefined;
  index: number;
  suggestions: UiProduct[];
};

/** Controller for the catalog product detail page: route param + product query. */
export function useCatalogProductController(): CatalogProductVm {
  const { id } = useParams() as { id: string };
  const { data: workspace } = useWorkspace();
  const { data: product, isLoading, isError, error } = useCatalogProduct(id, workspace);

  const catalogProducts = workspace?.catalogProducts ?? [];
  const index = catalogProducts.findIndex((p) => p.id === id);
  const safeIndex = index >= 0 ? index : 0;
  const currentProduct = product ?? catalogProducts[safeIndex];
  const sameCategory = catalogProducts.filter(
    (item) => item.id !== id && currentProduct?.category && item.category === currentProduct.category,
  );
  const fallback = catalogProducts.filter((item) => item.id !== id);
  const suggestions = [
    ...sameCategory,
    ...fallback.filter((item) => !sameCategory.some((match) => match.id === item.id)),
  ].slice(0, 3);

  return {
    isLoading: isLoading && !product,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load product"
      : null,
    product,
    index: safeIndex,
    suggestions,
  };
}
