// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { CopilotPage } from "./CopilotPage";
import * as api from "./api";
import { useCopilotStatus } from "./useCopilotStatus";
import { discoveryCategories } from "./discovery.testFixtures";

vi.mock("./api", () => ({
  createCopilotConversation: vi.fn(),
  deleteCopilotConversation: vi.fn(),
  getCopilotConversation: vi.fn(),
  listCopilotConversations: vi.fn(),
  streamCopilotMessage: vi.fn(),
}));
vi.mock("./useCopilotStatus", () => ({ useCopilotStatus: vi.fn() }));
const status = {
  enabled: true,
  provider: "openai",
  model: null,
  role: "company_admin",
  writeToolsEnabled: false,
  discovery: { categories: discoveryCategories },
  capabilities: [
    { id: "explore_catalog", group: "Discover", title: "Catalog", prompt: "Show apparel" },
  ],
};
const conversation = {
  id: "c1",
  title: "Welcome kits",
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCopilotStatus).mockReturnValue({
    data: status,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCopilotStatus>);
  vi.mocked(api.listCopilotConversations).mockResolvedValue({ items: [conversation] });
  vi.mocked(api.createCopilotConversation).mockResolvedValue({
    id: "c2",
    title: "New conversation",
  });
  vi.mocked(api.getCopilotConversation).mockResolvedValue({
    id: "c1",
    title: "Welcome kits",
    messages: [
      { role: "user", content: "A previous question" },
      { role: "assistant", content: "A previous reply" },
    ],
  });
  vi.mocked(api.streamCopilotMessage).mockImplementation(async (id, _content, handlers) => {
    handlers.onDelta?.("Here is a reply");
    handlers.onDone?.({ conversationId: id, title: "Gifting ideas" });
  });
});
afterEach(cleanup);
const setup = () =>
  render(
    <MemoryRouter initialEntries={["/husain/copilot"]}>
      <CopilotPage />
    </MemoryRouter>,
  );

function draftProductRequest() {
  fireEvent.click(screen.getByRole("button", { name: "Products & Kits" }));
  fireEvent.click(screen.getByRole("button", { name: "Explore products" }));
}
function sendProductRequest() {
  draftProductRequest();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
}

describe("Copilot workspace", () => {
  it("closes back to the page that launched Copilot", () => {
    localStorage.setItem("sm_workspace_slug", "husain");
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/husain/copilot",
            state: { copilotReturnTo: "/husain/orders?status=active" },
          },
        ]}
      >
        <Routes>
          <Route path="/husain/copilot" element={<CopilotPage />} />
          <Route path="/husain/orders" element={<p>Orders page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Copilot" }));
    expect(screen.getByText("Orders page")).toBeTruthy();
    localStorage.removeItem("sm_workspace_slug");
  });
  it("shows the existing chat welcome and configured categories without a curator entry or canvas", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "How can I help you today?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Curate Gifts/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gift recommendations")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-category-id]")).toHaveLength(discoveryCategories.length);
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
  });
  it("opens a saved curator conversation in normal chat and explicitly sends chat mode", async () => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({
      id: "c1", title: "Welcome kits", curator: { enabled: true },
      messages: [{ role: "assistant", content: "Saved gifting conversation" }],
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("Saved gifting conversation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Curate Gifts|Normal Copilot/ })).not.toBeInTheDocument();
    expect(document.querySelector(".sm-curator-layout")).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Show my products" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledWith("c1", "Show my products", expect.any(Object), expect.any(AbortSignal), [], "chat"));
    expect(await screen.findByText("Here is a reply")).toBeInTheDocument();
  });
  it("drafts the selected request and creates no conversation until the user sends", async () => {
    setup();
    draftProductRequest();
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
    expect(api.streamCopilotMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(await screen.findByText("Here is a reply")).toBeTruthy();
    expect(api.createCopilotConversation).toHaveBeenCalledOnce();
    expect(api.streamCopilotMessage).toHaveBeenCalledWith(
      "c2",
      "Show apparel",
      expect.any(Object),
      expect.any(AbortSignal),
      [],
      "chat",
    );
  });
  it("opens a saved conversation and returns to an empty new chat without creating a server record", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]);
    expect(screen.getByRole("heading", { name: "How can I help you today?" })).toBeTruthy();
    expect(api.createCopilotConversation).not.toHaveBeenCalled();
  });
  it("handles failed conversation loads and lets the user select it again", async () => {
    vi.mocked(api.getCopilotConversation).mockRejectedValueOnce(
      new Error("Could not load conversation"),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load conversation");
    fireEvent.click(screen.getByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
  });
  it("recovers the draft after a stream error and clears the loading state", async () => {
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce(async (_id, _content, handlers) => {
      handlers.onError?.({ message: "Connection interrupted" });
    });
    setup();
    sendProductRequest();
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Edit & retry" }));
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("button", { name: "Send message" })).not.toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps history interactive while a reply streams and aborts on unmount", async () => {
    let finish: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce(
      (_id, _content, _handlers, incomingSignal) => {
        signal = incomingSignal;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    const view = setup();
    sendProductRequest();
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: /Welcome kits/ })).not.toBeDisabled();
    expect(screen.getAllByRole("button", { name: "New chat" })[0]).not.toBeDisabled();
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => finish?.());
  });
  it("keeps history readable but disables sends when the provider is unavailable", async () => {
    vi.mocked(useCopilotStatus).mockReturnValue({
      data: { ...status, provider: "disabled" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCopilotStatus>);
    setup();
    expect(screen.getByRole("textbox")).not.toBeDisabled();
    draftProductRequest();
    expect(screen.getByRole("textbox")).toHaveValue("Show apparel");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeTruthy();
    expect(api.streamCopilotMessage).not.toHaveBeenCalled();
  });
  it("resets selected capabilities on new chat without deleting stored conversations", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Budgets & Wallet" }));
    expect(screen.getByRole("heading", { name: "How can I help with your budget?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("button", { name: "Products & Kits" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Welcome kits/ })).toBeTruthy();
    expect(api.deleteCopilotConversation).not.toHaveBeenCalled();
  });
});

describe("Copilot sidebar during streaming", () => {
  it("keeps the same sidebar nodes, scroll, selection and search state without refetching or reordering titles", async () => {
    vi.mocked(api.listCopilotConversations).mockResolvedValue({ items: [{ ...conversation, id: "other", title: "Earlier conversation" }, conversation] });
    let handlers!: api.StreamHandlers;
    let finish!: () => void;
    vi.mocked(api.streamCopilotMessage).mockImplementation((_id, _content, incoming) => {
      handlers = incoming;
      return new Promise<void>(resolve => { finish = resolve; });
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    await screen.findByText("A previous reply");
    const sidebar = screen.getByRole("complementary", { name: "Conversation history" });
    const list = sidebar.querySelector(".sm-copilot-history__list") as HTMLElement;
    const selected = within(sidebar).getByRole("button", { name: /Welcome kits/ });
    list.scrollTop = 174;
    fireEvent.click(within(sidebar).getByRole("button", { name: "Search saved conversations" }));
    const search = within(sidebar).getByRole("searchbox");
    fireEvent.change(search, { target: { value: " " } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hello" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledOnce());
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
    expect(list).toHaveAttribute("aria-busy", "false");
    expect(within(sidebar).queryByText(/Loading conversations/)).toBeNull();
    expect(selected).toHaveAttribute("aria-current", "true");
    expect(selected).not.toBeDisabled();
    expect(sidebar.querySelector(".sm-copilot-history__list")).toBe(list);
    expect(within(sidebar).getByRole("searchbox")).toBe(search);
    expect(list.scrollTop).toBe(174);
    act(() => handlers.onDelta?.("Hello from Claude"));
    expect(screen.getByText("Hello from Claude")).toBeInTheDocument();
    expect(screen.getByText("Writing…")).toBeInTheDocument();
    await act(async () => { handlers.onDone?.({ conversationId: "c1", title: "Updated title" }); finish(); });
    expect(within(sidebar).getByRole("button", { name: /Updated title/ })).toBe(selected);
    expect([...sidebar.querySelectorAll("[data-conversation-id]")].map(node => node.getAttribute("data-conversation-id"))).toEqual(["other", "c1"]);
    expect(list.scrollTop).toBe(174);
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
  });

  it("switches conversations while streaming without aborting or leaking deltas into the selected chat", async () => {
    let handlers!: api.StreamHandlers, signal!: AbortSignal;
    let finish!: () => void;
    vi.mocked(api.streamCopilotMessage).mockImplementation((_id, _content, incoming, incomingSignal) => {
      handlers = incoming; signal = incomingSignal!;
      return new Promise<void>(resolve => { finish = resolve; });
    });
    setup(); sendProductRequest();
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledOnce());
    act(() => handlers.onDelta?.("Background reply"));
    fireEvent.click(screen.getByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A previous reply")).toBeInTheDocument();
    act(() => handlers.onDelta?.(" continues"));
    expect(signal.aborted).toBe(false);
    expect(screen.queryByText(/Background reply/)).toBeNull();
    expect(screen.queryByText("Writing…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /New conversation/ }));
    expect(await screen.findByText("Background reply continues")).toBeInTheDocument();
    expect(api.getCopilotConversation).toHaveBeenCalledTimes(1);
    await act(async () => { handlers.onDone?.({ conversationId: "c2", title: "Completed reply" }); finish(); });
    expect(screen.queryByText("Writing…")).toBeNull();
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
  });

  it("adds a new conversation once and retains its title when a slower initial history fetch completes", async () => {
    let finishHistory!: (value: { items: api.CopilotConversationSummary[] }) => void;
    vi.mocked(api.listCopilotConversations).mockImplementationOnce(() => new Promise(resolve => { finishHistory = resolve; }));
    setup(); sendProductRequest();
    expect(await screen.findByText("Here is a reply")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gifting ideas/ })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText(/Loading conversations/)).toBeNull();
    await act(async () => finishHistory({ items: [conversation] }));
    expect(screen.getByRole("button", { name: /Welcome kits/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gifting ideas/ })).toHaveAttribute("aria-current", "true");
    expect(document.querySelectorAll('[data-conversation-id="c2"]')).toHaveLength(1);
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
  });

  it("keeps saved history after a failed message and fetches it again on page reload", async () => {
    vi.mocked(api.streamCopilotMessage).mockRejectedValueOnce(new Error("Message failed"));
    const view = setup();
    await screen.findByRole("button", { name: /Welcome kits/ });
    sendProductRequest();
    expect(await screen.findByRole("alert")).toHaveTextContent("Message failed");
    expect(screen.getByRole("button", { name: /Welcome kits/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /New conversation/ })).toBeInTheDocument();
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
    view.unmount(); setup();
    expect(await screen.findByRole("button", { name: /Welcome kits/ })).toBeInTheDocument();
    expect(api.listCopilotConversations).toHaveBeenCalledTimes(2);
  });

  it("keeps mobile history available during streaming and opens a saved conversation", async () => {
    let finish!: () => void;
    let handlers!: api.StreamHandlers;
    vi.mocked(api.streamCopilotMessage).mockImplementation((_id, _content, incoming) => {
      handlers = incoming;
      return new Promise<void>(resolve => { finish = resolve; });
    });
    setup(); sendProductRequest();
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Open conversation history" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation history" });
    const saved = within(dialog).getByRole("button", { name: /Welcome kits/ });
    expect(saved).not.toBeDisabled();
    expect(within(dialog).queryByText(/Loading conversations/)).toBeNull();
    fireEvent.click(saved);
    expect(await screen.findByText("A previous reply")).toBeInTheDocument();
    await act(async () => { handlers.onDone?.({ conversationId: "c2", title: "Finished elsewhere" }); finish(); });
    expect(screen.getByText("A previous reply")).toBeInTheDocument();
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
  });

  it("renders saved attachment metadata without exposing the transport suffix", async () => {
    const content = "Use this PO\n\n[Attachments]\n- Purchase order (documentTicketId=private-ticket).";
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Welcome kits", messages: [{ role: "user", content, attachments: [{ id: "file-1", kind: "purchase_order", originalName: "Team budget.pdf", mimeType: "application/pdf", sizeBytes: 2048, ticketId: "private-ticket" }] }] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("Team budget.pdf")).toBeInTheDocument();
    expect(screen.getByText("Use this PO")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/private-ticket|documentTicketId|\[Attachments\]/);
    expect(content).toContain("private-ticket");
  });

  it("renders a backend-completed store after reload without rebuilding Confirm from a saved preview", async () => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Welcome kits", messages: [{ role: "assistant", content: "Store details", artifacts: [{ kind: "success", operation: "shops.create", status: "completed", confirmationId: "completed-fixture", preview: { name: "Old preview" }, result: { id: "store-id", name: "AI Store", status: "live", currencyMode: "points" }, message: "AI Store is now Live." } as api.CopilotArtifact] }] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("AI Store is now Live.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByText("Old preview")).not.toBeInTheDocument();
  });

  it("opens saved wallet artifacts without a payload without crashing or inventing a balance", async () => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Wallet history", messages: [
      { role: "assistant", content: "A saved balance answer", artifacts: [{ kind: "wallet_balance" } as api.CopilotArtifact] },
    ] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A saved balance answer")).toBeInTheDocument();
    expect(screen.getByText(/Wallet balance is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Available ₹0")).toBeNull();
  });
});
