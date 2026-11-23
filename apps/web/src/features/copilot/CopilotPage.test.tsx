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
  it("shows research progress, keeps citations beside verified cards, and restores them from saved history", async () => {
    const research: api.CopilotArtifact = { kind: "web_research", research: {
      brief: { topic: "corporate gifting and merchandise", purpose: "comparison" },
      status: "partial", checkedAt: "2026-11-19T12:00:00.000Z", summarized: true,
      sources: [
        { title: "Public merchant listing", url: "https://example.com/listing", excerpt: "A notebook for corporate gifting." },
        { title: "Unsafe link", url: "javascript:alert(1)", excerpt: "This link must not render." },
      ],
    } };
    const product: api.CopilotArtifact = { kind: "product", product: { id: "catalog-notebook", name: "Verified notebook", sellingPriceInr: 225 } };
    let complete!: () => void;
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce((id, _prompt, handlers) => new Promise(resolve => {
      handlers.onTool?.("web_search", "running");
      complete = () => {
        handlers.onDelta?.("Consider a notebook for onboarding. [Source 1](<https://example.com/listing>).");
        handlers.onArtifacts?.([research, product]);
        handlers.onDone?.({ conversationId: id, title: "Welcome kits" });
        resolve();
      };
    }));
    const view = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Welcome kits" }));
    await screen.findByText("A previous reply");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Compare external and ShelfMerch options" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(await screen.findByText("Searching public web sources…")).toBeVisible();
    await act(async () => complete());
    const source = await screen.findByRole("link", { name: "Public merchant listing" });
    expect(source).toHaveAttribute("href", "https://example.com/listing");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Source 1" })).toHaveAttribute("href", "https://example.com/listing");
    expect(screen.queryByText("“A notebook for corporate gifting.”")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Unsafe link" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Verified notebook" })).toBeVisible();
    expect(screen.getByText("Verified ShelfMerch products")).toBeVisible();

    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ ...conversation, messages: [{
      role: "assistant", content: "Consider a notebook for onboarding. [Source 1](<https://example.com/listing>).", artifacts: [research, product],
    }] });
    view.unmount();
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Welcome kits" }));
    const restored = await screen.findByRole("region", { name: "External research" });
    expect(restored).toHaveTextContent("These findings are incomplete.");
    expect(within(restored).getByRole("link", { name: "Public merchant listing" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Source 1" })).toBeVisible();
    expect(within(restored).queryByRole("link", { name: "View Verified notebook" })).not.toBeInTheDocument();
  });

  it("restores search leads with their verification status and keeps fallback ideas visible", async () => {
    const research: api.CopilotArtifact = { kind: "web_research", research: {
      brief: { topic: "kitchen technology and kitchenware", purpose: "listings", region: "India" },
      status: "unverified", summarized: true, leadsOnly: true,
      sources: [{ title: "Public kitchenware listing", url: "https://example.com/listing", excerpt: "" }],
    } };
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ ...conversation, messages: [{
      role: "assistant", content: "**Unverified ideas to source**\n\nAsk a supplier about a coffee kit.", artifacts: [research],
    }] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Welcome kits" }));
    const restored = await screen.findByRole("region", { name: "External research" });
    expect(restored).toHaveTextContent("The search returned results");
    expect(restored).not.toHaveTextContent("I couldn’t find public sources");
    expect(within(restored).getByText("External search leads")).toBeVisible();
    expect(within(restored).getByRole("link", { name: "Public kitchenware listing" })).toHaveAttribute("href", "https://example.com/listing");
    expect(screen.getByText("Unverified ideas to source")).toBeVisible();
  });

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
    const reply = await screen.findByRole("article", { name: "Assistant" });
    expect(reply).toHaveTextContent(/^A previous reply$/);
    expect(reply.querySelector("img, svg, canvas")).toBeNull();
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
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Chat is currently unavailable");
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
  it("keeps the frame and previous transcript mounted while switching, and ignores late history responses", async () => {
    const second = { ...conversation, id: "c2", title: "Slow conversation" };
    const third = { ...conversation, id: "c3", title: "Next conversation" };
    vi.mocked(api.listCopilotConversations).mockResolvedValue({ items: [conversation, second, third] });
    let finishSlow!: (detail: Awaited<ReturnType<typeof api.getCopilotConversation>>) => void;
    let finishNext!: typeof finishSlow;
    vi.mocked(api.getCopilotConversation)
      .mockResolvedValueOnce({ ...conversation, messages: [{ role: "assistant", content: "Current transcript" }] })
      .mockImplementationOnce(() => new Promise(resolve => { finishSlow = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNext = resolve; }));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    const oldMessage = await screen.findByText("Current transcript");
    const sidebar = screen.getByRole("complementary", { name: "Conversation history" });
    const list = sidebar.querySelector(".sm-copilot-history__list")!;
    const composer = screen.getByRole("textbox");
    const slow = within(sidebar).getByRole("button", { name: /Slow conversation/ });
    const next = within(sidebar).getByRole("button", { name: /Next conversation/ });
    list.scrollTop = 48;

    fireEvent.click(slow);
    expect(screen.getByText("Opening conversation…")).toBeInTheDocument();
    expect(oldMessage.isConnected).toBe(true);
    expect(oldMessage.closest(".sm-copilot-messages")).toHaveAttribute("inert");
    expect(composer).toHaveAttribute("placeholder", "Ask ShelfMerch Copilot…");
    expect(next).toBeEnabled();
    fireEvent.click(next);
    await act(async () => finishNext({ ...third, messages: [{ role: "assistant", content: "Next transcript" }] }));
    await act(async () => finishSlow({ ...second, messages: [{ role: "assistant", content: "Obsolete transcript" }] }));

    expect(screen.getByText("Next transcript")).toBeInTheDocument();
    expect(screen.queryByText("Obsolete transcript")).not.toBeInTheDocument();
    expect(screen.queryByText("Opening conversation…")).not.toBeInTheDocument();
    expect(next).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("textbox")).toBe(composer);
    expect(list.scrollTop).toBe(48);
    expect(screen.getByRole("complementary", { name: "Conversation history" })).toBe(sidebar);
    expect(api.listCopilotConversations).toHaveBeenCalledOnce();
  });

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
  it('offers read-only conversation reload for a genuinely unreconciled reply without resending it', async () => {
    vi.mocked(api.streamCopilotMessage).mockImplementationOnce(async (_id,_content,handlers)=>{handlers.onError?.({code:'SWAG_REPLY_RELOAD_REQUIRED',message:'Your latest design is saved. Reload this conversation to continue.'});});
    setup();sendProductRequest();const reload=await screen.findByRole('button',{name:'Reload conversation'});
    expect(screen.queryByRole('button',{name:'Edit & retry'})).not.toBeInTheDocument();fireEvent.click(reload);
    expect(await screen.findByText('A previous reply')).toBeInTheDocument();expect(api.streamCopilotMessage).toHaveBeenCalledTimes(1);expect(api.getCopilotConversation).toHaveBeenCalledTimes(1);
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

  const logoQuestion = "Would you like to add your company logo? You can upload it using the + button below, or continue without one.";
  it.each([
    ["canonical", logoQuestion],
    ["legacy", "Would you like to add your company logo? You can upload it using + below, or skip for now."],
  ])("reopens a saved %s artwork step with one question after the selection", async (_version, content) => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ ...conversation, messages: [
      { role: "assistant", content: "Catalog results", artifacts: [
        { kind: "swag_step", swag: { step: "products", revision: 3, conversationId: conversation.id } },
        { kind: "product", product: { id: "p1", name: "Ceramic Mug", primaryImageUrl: "/uploads/mug.png", sellingPriceInr: 410, variants: [{ stock: 0 }] } },
      ] },
      { role: "user", content: "Continue" },
      { role: "assistant", content, artifacts: [{ kind: "swag_step", swag: {
        step: "artwork", revision: 4, conversationId: conversation.id,
        selectedProducts: [{ id: "p1", name: "Ceramic Mug", imageUrl: "/uploads/mug.png" }],
      } }] },
    ] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    const question = await screen.findByText(logoQuestion);
    const acknowledgement = screen.getByRole("group", { name: "Products selected for the collection" });
    expect(question.closest("article")).toHaveTextContent("Great! You've selected 1 product for your collection.");
    expect(screen.getByText("1 product").closest(".sm-copilot-md")).not.toBeNull();
    expect(acknowledgement.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(acknowledgement).getByRole("img", { name: "Ceramic Mug" })).toHaveAttribute("src", "/uploads/mug.png");
    expect(within(acknowledgement).getByText("₹410 incl. GST")).toBeVisible();
    expect(within(acknowledgement).getByText("Out of stock")).toBeVisible();
    expect(within(acknowledgement).getByRole("link", { name: "View Ceramic Mug" })).toHaveAttribute("href", expect.stringContaining("/catalog/p1"));
    const earlierCatalog = screen.getByText("Catalog results").closest("article")!;
    expect(within(earlierCatalog).getByRole("link", { name: "View Ceramic Mug" })).toBeVisible();
    expect(within(earlierCatalog).queryByRole("button", { name: /add ceramic mug/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Products shown earlier")).not.toBeInTheDocument();
    expect(screen.getAllByText(logoQuestion)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /skip logo/i })).not.toBeInTheDocument();
    expect(api.streamCopilotMessage).not.toHaveBeenCalled();
  });

  it("renders saved attachment metadata without exposing the transport suffix", async () => {
    const content = "Use this PO\n\n[Attachments]\n- Purchase order (documentTicketId=private-ticket).";
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Welcome kits", messages: [{ role: "user", content, attachments: [{ id: "file-1", kind: "purchase_order", originalName: "Team budget.pdf", mimeType: "application/pdf", sizeBytes: 2048, ticketId: "private-ticket" }] }] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("Purchase order")).toBeInTheDocument();
    expect(screen.queryByText("Team budget.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Use this PO")).toHaveClass("sm-copilot-user-text");
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

  it("shows the saved wallet reply once when all three amounts match its snapshot", async () => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Wallet history", messages: [{
      role: "assistant",
      content: "Your wallet balance is **₹20,000**.\n- **Allocated budget:** ₹7,000\n- **Remaining budget:** ₹13,000",
      artifacts: [{ kind: "wallet_balance", wallet: { balance: 20000, allocatedAmount: 7000, unallocatedAmount: 13000 } }],
    }] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Welcome kits" }));
    const reply = await screen.findByRole("article", { name: "Assistant" });
    expect(within(reply).getByText("₹20,000")).toBeVisible();
    expect(reply).toHaveTextContent("Allocated budget: ₹7,000");
    expect(reply).toHaveTextContent("Remaining budget: ₹13,000");
    expect(within(reply).queryByLabelText("Wallet balance")).not.toBeInTheDocument();
  });

  it("opens saved wallet artifacts without a payload without crashing or inventing a balance", async () => {
    vi.mocked(api.getCopilotConversation).mockResolvedValueOnce({ id: "c1", title: "Wallet history", messages: [
      { role: "assistant", content: "A saved balance answer", artifacts: [{ kind: "wallet_balance" } as api.CopilotArtifact] },
    ] });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Welcome kits/ }));
    expect(await screen.findByText("A saved balance answer")).toBeInTheDocument();
    expect(screen.getByText(/No balance snapshot is available for this reply/)).toBeInTheDocument();
    expect(screen.queryByText("Available ₹0")).toBeNull();
  });
});
