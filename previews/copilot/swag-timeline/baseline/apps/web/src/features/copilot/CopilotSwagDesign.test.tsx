// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotUserMessage } from "./CopilotUserMessage";
import { validateAttachmentFile } from "./attachments";
import type { CopilotConfirmationArtifact, CopilotSuccessArtifact } from "./api";
import * as api from "./api";

vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(),
  executeCopilotWriteApi: vi.fn(), resolveCopilotWriteApi: vi.fn(), cancelCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn(),
}));
const id = "1234567890abcdef12345678";
const preview = { name: "New Employee Swag", action: "publish", artworkStatus: "Not applied",
  products: [{ id, name: "ActiveDry Polo", sellingPriceInr: 500 }],
  stores: [{ id, name: "AI Store", status: "live" }, { id: "abcdef123456789012345678", name: "Another Store", status: "draft" }],
  visibility: "Collection listings become active; draft stores remain draft", variantPolicy: "All enabled catalog variants",
};
const artifact: CopilotConfirmationArtifact = { kind: "confirmation", operation: "swag.collection", status: "pending",
  confirmationId: "swag-confirmation-1234567890", request: { conversationId: id, revision: 2, action: "publish" }, preview };
const result = { ...preview, id, productCount: 1, status: "ready", published: true, collectionPath: "/swag", editorPath: `/swag/new?edit=${id}` };
const success: CopilotSuccessArtifact = { kind: "success", operation: artifact.operation, confirmationId: artifact.confirmationId, message: "Recorded", result };
beforeEach(() => {
  vi.mocked(api.resolveCopilotWriteApi).mockReset().mockResolvedValue({ status: "pending", confirmationId: artifact.confirmationId });
  vi.mocked(api.executeCopilotWriteApi).mockReset().mockResolvedValue(result);
  vi.mocked(api.cancelCopilotWriteApi).mockReset().mockResolvedValue({ status: "cancelled", confirmationId: artifact.confirmationId });
  vi.mocked(api.persistCopilotWriteArtifactApi).mockReset().mockResolvedValue({} as never);
});
afterEach(cleanup);

it("shows one final publication card with actual products, optional artwork, stores and visibility", () => {
  render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
  expect(screen.getByText("Publish your collection?")).toBeInTheDocument();
  expect(screen.getByText("ActiveDry Polo")).toBeInTheDocument();
  expect(screen.getAllByText("Not applied")[0]).toBeVisible();
  expect(screen.getAllByText("AI Store, Another Store (draft store)")[0]).toBeVisible();
  expect(screen.getByText(/Draft stores remain draft/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm & Publish" })).toBeInTheDocument();
  expect(screen.getAllByRole("button").length).toBe(2);
});
it("double clicking uses a stable confirmation key and calls execute only once", async () => {
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  const button = screen.getByRole("button", { name: "Confirm & Publish" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "success", result })));
  expect(api.executeCopilotWriteApi).toHaveBeenCalledTimes(1);
  expect(api.executeCopilotWriteApi).toHaveBeenCalledWith("swag.collection", expect.objectContaining({ idempotencyKey: `swag:${artifact.confirmationId}`, revision: 2 }));
});
it("Cancel does not publish", async () => {
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it("Save Design has its own explicit label and never turns into a publish request", async () => {
  render(<CopilotConfirmationCard artifact={{ ...artifact, preview: { ...preview, action: "save", stores: [] },
    request: { ...artifact.request!, action: "save" } }} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Save Design" }));
  await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledWith("swag.collection", expect.objectContaining({ action: "save" })));
});
it("reload resolves committed publication read-only without offering another confirmation", async () => {
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "completed", confirmationId: artifact.confirmationId, result });
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "success", result })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it("uncertain publication never reports success or automatically retries", async () => {
  vi.mocked(api.executeCopilotWriteApi).mockRejectedValue(new Error("Publication acknowledgement unavailable"));
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "consumed", confirmationId: artifact.confirmationId });
  const onChange = vi.fn();
  // Allow the initial read, then simulate an uncertain execute response.
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValueOnce({ status: "pending", confirmationId: artifact.confirmationId });
  render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "consumed" })));
  expect(api.executeCopilotWriteApi).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "success" }));
});
it.each(["cancelled", "failed", "expired", "consumed"] as const)("does not revive a %s confirmation on reload", async status => {
  render(<CopilotConfirmationCard artifact={{ ...artifact, status }} onChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Confirm & Publish" })).not.toBeInTheDocument();
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it("uses backend-verified result facts and returned routes for the completed card", () => {
  render(<CopilotWriteSuccess artifact={success} />);
  expect(screen.getByText("Your New Employee Swag collection has been published to AI Store, Another Store.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View collection" })).toHaveAttribute("href", expect.stringContaining("/swag"));
  expect(screen.getByRole("link", { name: "Manage AI Store" })).toHaveAttribute("href", expect.stringContaining(`/shops/${id}`));
  expect(screen.queryByRole("link", { name: "Edit design" })).not.toBeInTheDocument();
});
it("saved-only results remain unpublished and link to the existing visual editor", () => {
  render(<CopilotWriteSuccess artifact={{ ...success, result: { ...result, action: "save", published: false, stores: [], status: "draft" } }} />);
  expect(screen.getByText(/design is saved for later. It has not been published/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Edit design" })).toHaveAttribute("href", expect.stringContaining(`/swag/new?edit=${id}`));
});
it("shows only persisted mockup previews, without inventing a preview for uncustomized products", () => {
  const view = render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  view.rerender(<CopilotConfirmationCard artifact={{ ...artifact, preview: { ...preview,
    designs: [{ productId: id, mockupUrl: "/uploads/synthetic-saved.png", placements: [{ key: "front" }] }],
  } }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Saved design previews")).toBeVisible();
  expect(screen.getByAltText("Saved design for ActiveDry Polo")).toHaveAttribute("src", expect.stringContaining("/uploads/synthetic-saved.png"));
  expect(screen.getByText("Saved preview · front")).toBeInTheDocument();
});
it("does not report completed publication when returned store outcomes are missing", () => {
  render(<CopilotWriteSuccess artifact={{ ...success, result: { ...result, stores: [] } }} />);
  expect(screen.getByText("Publication needs review")).toBeInTheDocument();
  expect(screen.queryByText(/has been published to/)).not.toBeInTheDocument();
});
it("reuses the + attachment menu with a distinct swag artwork purpose", () => {
  render(<CopilotComposer draft="" onDraft={vi.fn()} busy={false} disabled={false} onSend={vi.fn()} attachments={[]}
    onAttachmentsChange={vi.fn()} onUploadAttachment={vi.fn()} onRemoveAttachment={vi.fn()} onRetryAttachment={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
  expect(screen.getByRole("menuitem", { name: /Swag design artwork/ })).toBeInTheDocument();
});
it("validates the swag PNG extension and renders its attachment without internal suffix prose", () => {
  expect(validateAttachmentFile("swag_artwork", new File(["jpg"], "photo.jpg", { type: "image/jpeg" }))).toMatch(/PNG/);
  render(<CopilotUserMessage content={'Use my logo\n\n[Attachments]\n- Swag artwork "logo.png". swagArtworkAttachmentId: private-id'}
    attachments={[{ id, kind: "swag_artwork", originalName: "logo.png", mimeType: "image/png", sizeBytes: 500 }]} />);
  expect(screen.getByText("logo.png")).toBeInTheDocument();
  expect(screen.queryByText(/private-id/)).not.toBeInTheDocument();
});
