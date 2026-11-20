// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShopLayoutTab } from "./ShopLayoutTab";
import { GeneralSettingsTab } from "./GeneralSettingsTab";
import { useUpdateShop } from "../model";
import type { UiShop } from "@/services/mappers";

vi.mock("../model", () => ({ useUpdateShop: vi.fn() }));
const update = vi.fn();
const shop = {
  id: "synthetic-store", name: "Synthetic store", currency: "INR", currencyMode: "inr",
  pointsConversionEnabled: false, live: true, categories: ["Merch"],
  logoUrl: "/existing-logo.png", bannerConfig: { theme: "dark", preset: "solid-pattern" },
} as UiShop;
beforeEach(() => {
  update.mockReset().mockResolvedValue({});
  vi.mocked(useUpdateShop).mockReturnValue({ mutateAsync: update, isPending: false } as unknown as ReturnType<typeof useUpdateShop>);
});
afterEach(cleanup);

describe("existing Store Layout and currency controls", () => {
  it("previews a library banner and saves only through Save changes", async () => {
    render(<ShopLayoutTab shop={shop} />);
    expect(screen.queryByRole("button", { name: "Welcome" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit banner" }));
    expect(screen.getByText("Banner library")).toBeInTheDocument();
    expect(screen.getByText("Solid colour")).toBeInTheDocument();
    expect(screen.getByText("Custom banner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Welcome" }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      shopId: shop.id, input: { logoUrl: shop.logoUrl, bannerConfig: { preset: "welcome", theme: "dark" } },
    }));
    expect(update).toHaveBeenCalledOnce();
  });

  it("supports a solid-colour selection without a currency or publish update", async () => {
    render(<ShopLayoutTab shop={shop} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit banner" }));
    fireEvent.click(screen.getByRole("button", { name: "blue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      shopId: shop.id, input: { logoUrl: shop.logoUrl, bannerConfig: { theme: "blue" } },
    }));
    expect(update.mock.calls[0][0].input).not.toHaveProperty("currencyMode");
    expect(update.mock.calls[0][0].input).not.toHaveProperty("status");
  });

  it("keeps the current dashboard currency field disabled despite the intended editable product behavior", () => {
    render(<GeneralSettingsTab shop={shop} />);
    const currency = screen.getByDisplayValue("INR");
    expect(currency).toBeDisabled();
    expect(currency).toHaveAttribute("readonly");
    expect(screen.getByText(/Store currency is locked and cannot be changed after creation/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
