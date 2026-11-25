import type { CopilotCategory } from "./api";

// UI contract examples only. Authorization is tested against the server resolver.
export const discoveryCategories: CopilotCategory[] = [
  {
    id: "products_kits",
    title: "Products & Kits",
    description: "Discover merchandise and gift kits",
    heading: "What would you like to explore?",
    actions: [
      {
        id: "products_explore",
        title: "Explore products",
        description: "Browse real inventory.",
        availability: "available",
        prompt: "Show apparel",
      },
      {
        id: "products_budget",
        title: "Find products within a budget",
        description: "Start with your spending limit.",
        availability: "available",
        prompt: "Help me find available merchandise within a budget. Ask me for my spending limit first.",
      },
      {
        id: "kits_curated",
        title: "Explore curated kits",
        description: "Browse ready-made gifting collections.",
        availability: "available",
        prompt: "Show me the curated gift kits available in ShelfMerch.",
      },
      {
        id: "kits_customized",
        title: "View my customized kits",
        description: "See kits in this workspace.",
        availability: "available",
        prompt: "Show the customized kits I can access in this workspace.",
      },
      {
        id: "kits_contents",
        title: "Explore kit contents",
        description: "See the actual products in a kit.",
        availability: "available",
        prompt: "Help me explore the actual products inside a gift kit. Ask me which kit to look at first.",
      },
      {
        id: "products_recommendations",
        title: "Get product recommendations",
        description: "Choose merchandise for an occasion.",
        availability: "available",
        prompt: "Recommend suitable merchandise for an occasion.",
      },
    ],
  },
  {
    id: "budgets_wallet",
    title: "Budgets & Wallet",
    description: "View available funds",
    heading: "How can I help with your budget?",
    actions: [
      {
        id: "budget_available",
        title: "Check my available budget",
        description: "",
        availability: "available",
        prompt: "Show my current available budget.",
      },
      {
        id: "budget_allocate",
        title: "Allocate budget to a department",
        description: "",
        availability: "integration_pending",
        explanation: "Coming to Copilot; this action cannot run here yet.",
      },
    ],
  },
];
