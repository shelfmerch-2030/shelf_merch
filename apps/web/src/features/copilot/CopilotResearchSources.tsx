import type { CopilotWebResearch } from "./api";

const statusText: Partial<Record<CopilotWebResearch["status"], string>> = {
  partial: "The search returned some sources before it stopped. These findings are incomplete.",
  unavailable: "Web research couldn’t complete for this reply. You can try again.",
  no_sources: "I couldn’t find public sources to verify this request.",
  unverified: "The search returned results, but I couldn’t verify a match for this request.",
  synthesis_failed: "I found sources, but couldn’t finish checking them for this reply.",
  limited: "The web search limit was reached for this reply.",
  disabled: "Web research is currently unavailable in this workspace.",
  unsupported_topic: "Web research needs a supported public topic, such as corporate gifting, technology, or event giveaways.",
};

function externalHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

export function CopilotResearchSources({ research }: { research: CopilotWebResearch }) {
  const status = statusText[research.status];
  const sources = research.sources.flatMap(source => {
    const url = externalHref(source.url);
    return url ? [{ ...source, url }] : [];
  });
  const checkedAt = research.checkedAt ? new Date(research.checkedAt) : null;
  const showDate = checkedAt && Number.isFinite(checkedAt.getTime()) && sources.length > 0;
  return <section className="sm-copilot-md sm-copilot-research" aria-label="External research">
    {status ? <p role="status">{status}</p> : null}
    {sources.length ? <>
      <p><strong>{research.leadsOnly ? "External search leads" : "External sources"}</strong>{showDate ? <> · <span>{research.leadsOnly ? "Found" : "Checked"}</span> <time dateTime={research.checkedAt}>
        {checkedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
      </time></> : null}</p>
      <ol>
        {sources.map(({ url, title, excerpt }) => <li key={url.href}>
          <a href={url.href} target="_blank" rel="noopener noreferrer">{title}</a>
          {" · "}<span className="sm-copilot-research__domain">{url.hostname}</span>
          {excerpt && !research.summarized ? <p>“{excerpt}”</p> : null}
        </li>)}
      </ol>
      {research.brief.purpose === "listings" || research.brief.purpose === "comparison"
        ? <p>Confirm current unit price, GST, shipping and stock with the external seller.</p> : null}
    </> : null}
  </section>;
}
