import { useCatalogCategoriesController } from "./controllers/useCatalogCategoriesController";
import { CatalogCategoriesView } from "./views/CatalogCategoriesView";

export function CatalogCategoriesPage() {
  const vm = useCatalogCategoriesController();
  return <CatalogCategoriesView {...vm} />;
}
