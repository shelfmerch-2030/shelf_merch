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

  const workspaceProduct = catalogProducts.find((p) => p.id === id);
  const mergedProduct = product
    ? {
        ...workspaceProduct,
        ...product,
        variants: product.variants?.length ? product.variants : workspaceProduct?.variants,
        colors: product.colors?.length ? product.colors : workspaceProduct?.colors,
        colorHexByName: product.colorHexByName ?? workspaceProduct?.colorHexByName,
      }
    : workspaceProduct;

  return {
    isLoading: isLoading && !product,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load product"
      : null,
    product: mergedProduct,
    index: safeIndex,
    suggestions,
  };
}
