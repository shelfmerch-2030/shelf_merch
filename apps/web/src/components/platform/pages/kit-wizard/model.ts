import type { KitInput } from "@/services/platform-api";

export {
  addKitItem,
  createKit,
  fetchPlatformProducts,
  getPlatformKit,
  getPlatformProduct,
  publishKit,
  removeKitImage,
  removeKitItem,
  updateKit,
  updateKitImageRoles,
  uploadKitImages,
  type KitInput,
  type KitItem,
  type KitItemImage,
  type KitVariantImage,
  type PlatformKit,
  type ProductVariant,
} from "@/services/platform-api";

export const KIT_WIZARD_STEPS = ["Details & rules", "Items", "Images", "Review"] as const;
export const PACKAGING = ["none", "box", "premium_box"] as const;
export const CAMPAIGN_TYPES = [
  "Employee onboarding",
  "Diwali gifting",
  "Event swag",
  "Uniform campaign",
  "Birthday gift",
  "Work anniversary",
  "Sales prospect gift",
  "Custom campaign",
];

export const emptyKitDetails: KitInput = {
  name: "",
  description: "",
  packaging: "box",
  eligibleCampaignTypes: [],
  approxValueInr: 0,
  rules: {
    fixedComposition: true,
    customizationAllowed: true,
    requireLogo: true,
    minQtyPerRecipient: 1,
    maxQtyPerRecipient: 1,
  },
};

export type ProductRow = { _id: string; name: string; sku: string };
