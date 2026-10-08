export function catalogProductMeta(
  product: {
    id: string;
    name?: string;
    description?: string;
    brand?: string;
    category?: string;
    image?: string;
  },
  origin: string,
): {
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  jsonLd: Record<string, unknown>;
};
