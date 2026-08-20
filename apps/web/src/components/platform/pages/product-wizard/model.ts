import type { ProductInput, ProductVariant } from "@/services/platform-api";

export {
  addVariant,
  createProduct,
  getPlatformProduct,
  publishProduct,
  setPrintAreas,
  updateProduct,
  updateVariant,
  uploadProductImage,
  setProductRoleImageByUrl,
  type PhysicalDimensions,
  type PlatformProduct,
  type PrintArea,
  type ProductInput,
  type ProductVariant,
  type ProductImageRole,
} from "@/services/platform-api";

export const PRODUCT_WIZARD_STEPS = ["Details", "Variants", "Images", "Print areas", "Review"] as const;
export const MANUAL_CATEGORIES = [
  "Apparel",
  "Accessories",
  "Bags",
  "Drinkware",
  // "Health & Wellness",
  "Office Supplies",
  "Technology",
] as const;

export const SUBCATEGORIES_BY_CATEGORY: Record<(typeof MANUAL_CATEGORIES)[number], readonly string[]> = {
  Apparel: ["T-Shirts", "Polo Shirts", "Hoodies & Sweatshirts", "Jackets", "Caps"],
  Accessories: ["Lanyards", "Key Chains", "Badges", "Travel Accessories", "Lifestyle Accessories"],
  Bags: ["Backpacks", "Tote Bags", "Laptop Bags", "Duffel Bags", "Messenger Bags"],
  Drinkware: ["Bottles", "Mugs", "Tumblers", "Flasks", "Sippers"],
  "Office Supplies": ["Notebooks", "Diaries", "Pens", "Desk Accessories", "Calendars", "Card Holders"],
  Technology: ["Power Banks", "Wireless Chargers", "Speakers", "Headphones", "USB Drives"],
};

export const emptyProductDetails: ProductInput = {
  name: "",
  category: "",
  subcategory: "",
  sellingPriceInr: 0,
  costPriceInr: 0,
  brand: "",
  description: "",
  keyFeatures: "",
  sizeGuide: "",
  gstRate: 18,
  hsnCode: "",
  moq: 1,
  material: "",
  productionDays: 7,
};

export const emptyVariant: ProductVariant = {
  size: "",
  color: "",
  colorHex: "#ffffff",
  sku: "",
  stock: 0,
  enabled: true,
};

/** Returns true when a PNG contains any transparent pixel. */
export async function pngHasTransparency(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) return true;
    }
    return false;
  } finally {
    bitmap.close();
  }
}
