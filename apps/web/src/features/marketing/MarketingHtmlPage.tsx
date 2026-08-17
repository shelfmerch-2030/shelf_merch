import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import "@/components/landing-page.css";
import aboutHtml from "./pages/about.html?raw";
import careersHtml from "./pages/careers.html?raw";
import platformHtml from "./pages/platform.html?raw";
import privacyHtml from "./pages/privacy.html?raw";
import termsHtml from "./pages/terms.html?raw";

type MarketingPageKey = "about" | "careers" | "platform" | "privacy" | "terms";

const PAGE_HTML: Record<MarketingPageKey, string> = {
  about: aboutHtml,
  careers: careersHtml,
  platform: platformHtml,
  privacy: privacyHtml,
  terms: termsHtml,
};

const MARKETING_PAGE_NORMALIZE_CSS = `
  :host {
    --marketing-header-offset: 70px;
    font-family: Arial, Helvetica, sans-serif;
    letter-spacing: 0;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body, main, section, article, div, p, a, button, input, textarea, select {
    font-family: Arial, Helvetica, sans-serif;
  }

  h1, h2, h3, h4, p, ul, ol, blockquote {
    margin-top: 0;
  }

  h1, h2, h3, h4 {
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 780;
    letter-spacing: -0.02em;
  }

  h1 em, h2 em, h3 em, h4 em {
    font-family: Georgia, "Times New Roman", Times, serif;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0;
  }

  .hero h1,
  .cta h2,
  .final h2,
  .help h2 {
    font-size: clamp(48px, 5.6vw, 86px) !important;
    line-height: 1.05 !important;
    letter-spacing: -0.02em !important;
    margin: 22px 0 20px !important;
  }

  h2,
  .headline h2,
  .section-head h2,
  .control h2,
  .control-head h2,
  .manifesto h2,
  .story h2,
  .made h2,
  .principles h2,
  .stores h2,
  .open-head h2 {
    font-size: clamp(32px, 3.6vw, 54px) !important;
    line-height: 0.95 !important;
    letter-spacing: -0.065em !important;
    margin: 12px 0 16px !important;
  }

  h3,
  .feature h3,
  .swag-card h3,
  .gift-card h3,
  .model-grid h3,
  .brief-grid h3,
  .job-title h3,
  .timeline h3,
  .control-grid h3,
  .why-grid h3 {
    font-size: clamp(20px, 1.9vw, 30px) !important;
    line-height: 1.05 !important;
    letter-spacing: -0.04em !important;
    margin: 12px 0 8px !important;
  }

  p,
  li,
  .copy p,
  .copy li,
  .hero-copy > p,
  .intro > p,
  .intro p,
  .section-head > p,
  .control-head p,
  .section-heading p,
  .stores-copy > p,
  .made-copy > p,
  .story-head > p,
  .open-head p,
  .feature > p,
  .swag-card > p,
  .gift-card > p,
  .model-grid p,
  .brief-grid p,
  .why-grid p,
  .job-body p,
  .job-body li {
    font-size: 15.5px !important;
    line-height: 1.7 !important;
    letter-spacing: 0 !important;
  }

  small,
  .copy em,
  .title em,
  .toc a,
  .clean-list li,
  .process b,
  .process p,
  .step p,
  .summary-grid p,
  .data-card p,
  .job-meta span,
  .job-title span,
  .job-apply p {
    font-size: 12.5px !important;
    line-height: 1.55 !important;
    letter-spacing: 0 !important;
  }

  .kicker,
  .eyebrow,
  .number,
  .mini-label,
  .toc > span,
  .date,
  .card-top,
  .job-no,
  .filters button {
    font-size: 10px !important;
    line-height: 1.2 !important;
    letter-spacing: 0.16em !important;
  }

  .hero {
    min-height: min(620px, calc(100vh - var(--marketing-header-offset))) !important;
    padding-top: 0 !important;
  }

  .hero-copy,
  .final,
  .cta,
  .help {
    padding-top: clamp(44px, 5vw, 68px) !important;
    padding-bottom: clamp(44px, 5vw, 68px) !important;
  }

  .section,
  .manifesto,
  .model,
  .story,
  .briefs,
  .principles,
  .why,
  .openings,
  .process,
  .control,
  .gifting,
  .swag,
  .stores,
  .recognition,
  .layout {
    padding-top: 36px !important;
    padding-bottom: 36px !important;
  }

  .section-head,
  .control-head,
  .open-head,
  .split-heading {
    gap: 24px !important;
    margin-bottom: 22px !important;
  }

  .copy {
    margin-top: 16px !important;
  }

  .copy p {
    margin-bottom: 10px !important;
  }

  .toc a {
    padding: 7px 0 !important;
  }

  .clean-list li {
    padding: 8px 0 !important;
  }

  .feature,
  .swag-card,
  .gift-card,
  .model-grid article,
  .brief-grid article,
  .why-grid article,
  .control-grid article {
    padding: 22px !important;
  }

  .collage,
  .hero-ui,
  .hero-art {
    min-height: 560px !important;
  }

  .dashboard {
    height: 500px !important;
    top: 11% !important;
  }

  .main-photo {
    height: 54% !important;
    top: 16% !important;
  }

  .small-photo {
    height: 28% !important;
  }

  .model-grid article,
  .brief-grid article,
  .feature,
  .swag-card,
  .gift-card {
    min-height: 430px !important;
  }

  .control-grid article,
  .why-grid article,
  .principle-grid article,
  .step {
    min-height: 210px !important;
  }

  .made,
  .made-image {
    min-height: 560px !important;
  }

  .mock,
  .gift-link,
  .gift-box {
    transform: scale(0.86) !important;
    transform-origin: bottom left !important;
  }
  .recognition .feature,
  .gifting .gift-card,
  .swag .swag-card {
    overflow: hidden !important;
  }

  .recognition .feature {
    min-height: 455px !important;
    padding-bottom: 190px !important;
  }

  .recognition .feature .mock {
    left: 28px !important;
    right: 28px !important;
    bottom: -8px !important;
    transform: scale(0.78) !important;
    transform-origin: bottom center !important;
  }

  .swag .swag-card {
    min-height: 440px !important;
    padding-bottom: 190px !important;
  }

  .swag .shirt {
    width: 150px !important;
    height: 155px !important;
    left: 12% !important;
    bottom: 30px !important;
    font-size: 46px !important;
  }

  .swag .ticket,
  .swag .bulk-stat {
    width: 170px !important;
    right: 7% !important;
    bottom: 56px !important;
    transform: rotate(4deg) scale(0.82) !important;
    transform-origin: center !important;
  }

  .swag .bulk-stat {
    transform: rotate(-3deg) scale(0.82) !important;
  }

  .swag .box-stack {
    left: 8% !important;
    bottom: 40px !important;
    transform: scale(0.72) !important;
    transform-origin: left bottom !important;
  }

  .gifting .gift-card {
    min-height: 440px !important;
    padding-bottom: 180px !important;
  }

  .gifting .gift-box {
    left: 36px !important;
    right: 36px !important;
    bottom: -18px !important;
    transform: scale(0.78) !important;
    transform-origin: bottom center !important;
  }

  .gifting .gift-link {
    bottom: 34px !important;
    transform: rotate(-2deg) scale(0.82) !important;
    transform-origin: bottom center !important;
  }

  .intro#connects {
    background: #f7f3ea !important;
    padding: 48px 5vw 56px !important;
    grid-template-columns: 1fr 0.9fr !important;
    gap: 28px 48px !important;
  }

  .intro#connects .headline .kicker {
    color: #ff6d55 !important;
    letter-spacing: 0.18em !important;
  }

  .intro#connects .headline h2 {
    font-size: clamp(42px, 4.8vw, 68px) !important;
    line-height: 0.92 !important;
    letter-spacing: -0.055em !important;
    margin: 16px 0 0 !important;
    color: #121212 !important;
  }

  .intro#connects .headline h2::after {
    content: "";
    display: block;
    width: 104px;
    height: 3px;
    margin-top: 18px;
    border-radius: 999px;
    background: #ff6d55;
    transform: rotate(-2deg);
  }

  .intro#connects > p {
    align-self: start !important;
    max-width: 620px !important;
    margin-top: 28px !important;
    color: #5f5b55 !important;
    font-size: 18px !important;
    line-height: 1.5 !important;
  }

  .intro#connects .flow {
    grid-column: 1 / 3 !important;
    margin-top: 18px !important;
    padding: 24px 30px !important;
    min-height: 285px !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 0 !important;
    border: 1px solid rgba(18,18,18,.12) !important;
    border-radius: 18px !important;
    background: rgba(255,255,255,.74) !important;
    box-shadow: 0 20px 55px rgba(18,18,18,.08) !important;
    overflow: visible !important;
  }

  .intro#connects .flow > i {
    position: absolute !important;
    top: 50% !important;
    z-index: 2 !important;
    width: 38px !important;
    height: 38px !important;
    margin: 0 !important;
    border-radius: 50% !important;
    background: #fff !important;
    color: #d65a34 !important;
    box-shadow: 0 10px 24px rgba(18,18,18,.08) !important;
    display: grid !important;
    place-items: center !important;
    font-size: 23px !important;
    transform: translate(-50%, -50%) !important;
  }

  .intro#connects .flow > i:nth-of-type(1) { left: 25% !important; }
  .intro#connects .flow > i:nth-of-type(2) { left: 50% !important; }
  .intro#connects .flow > i:nth-of-type(3) { left: 75% !important; }
  .intro#connects .flow article:nth-of-type(1) { grid-column: 1 !important; }
  .intro#connects .flow article:nth-of-type(2) { grid-column: 2 !important; }
  .intro#connects .flow article:nth-of-type(3) { grid-column: 3 !important; }
  .intro#connects .flow article:nth-of-type(4) { grid-column: 4 !important; }

  .intro#connects .flow article {
    position: relative !important;
    min-height: 235px !important;
    padding: 0 22px !important;
    align-items: center !important;
    justify-content: center !important;
    text-align: center !important;
    border-right: 1px solid rgba(214,90,52,.16) !important;
  }

  .intro#connects .flow article:last-of-type {
    border-right: 0 !important;
  }

  .intro#connects .flow article > span {
    position: absolute !important;
    top: 6px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    padding: 5px 12px !important;
    border-radius: 999px !important;
    background: #fff3ec !important;
    color: #ff6d55 !important;
    font-size: 13px !important;
    font-weight: 800 !important;
    letter-spacing: 0.04em !important;
  }

  .intro#connects .flow .ico {
    width: 82px !important;
    height: 82px !important;
    margin: 32px auto 20px !important;
    border-radius: 50% !important;
    border: 2px solid #eadcc7 !important;
    background: radial-gradient(circle, #fff 0 42%, #f7efe6 43% 100%) !important;
    display: grid !important;
    place-items: center !important;
    color: #121212 !important;
    font-size: 31px !important;
    line-height: 1 !important;
  }

  .intro#connects .flow b {
    display: block !important;
    font-size: 20px !important;
    line-height: 1.15 !important;
    letter-spacing: -0.04em !important;
    margin-bottom: 18px !important;
  }

  .intro#connects .flow b::after {
    content: "";
    display: block;
    width: 48px;
    height: 3px;
    margin: 14px auto 0;
    border-radius: 999px;
    background: #d65a34;
  }

  .intro#connects .flow small {
    display: block !important;
    color: #6b6660 !important;
    font-size: 16px !important;
    line-height: 1.35 !important;
    max-width: 210px !important;
    margin: 0 auto !important;
  }
  .dashboard p,
  .dashboard small,
  .dashboard b,
  .float-card b,
  .float-card small,
  .store-browser small,
  .store-browser b,
  .store-browser span,
  .store-browser i,
  .mock small,
  .mock b,
  .mock span,
  .mock p,
  .career-board small,
  .career-board b,
  .career-board span,
  .career-board em {
    font-size: revert !important;
    line-height: revert !important;
  }

  @media (max-width: 760px) {
    .hero h1,
    .cta h2,
    .final h2,
    .help h2 {
      font-size: 44px !important;
    }

    h2,
    .headline h2,
    .section-head h2,
    .control h2,
    .control-head h2,
    .manifesto h2,
    .story h2,
    .made h2,
    .principles h2,
    .stores h2,
    .open-head h2 {
      font-size: 32px !important;
    }

    p,
    li,
    .copy p,
    .copy li,
    .hero-copy > p,
    .intro > p,
    .intro p,
    .section-head > p,
    .control-head p,
    .section-heading p {
      font-size: 13px !important;
    }

    .intro#connects {
      grid-template-columns: 1fr !important;
      gap: 22px !important;
      padding: 56px 5vw !important;
    }

    .intro#connects > p {
      margin-top: 0 !important;
      font-size: 16px !important;
    }

    .intro#connects .flow {
      grid-column: 1 !important;
      grid-template-columns: 1fr !important;
      padding: 24px !important;
      min-height: 0 !important;
      gap: 12px !important;
    }

    .intro#connects .flow > i {
      position: static !important;
      transform: rotate(90deg) !important;
      margin: 0 auto !important;
    }

    .intro#connects .flow article,
    .intro#connects .flow article:nth-of-type(1),
    .intro#connects .flow article:nth-of-type(2),
    .intro#connects .flow article:nth-of-type(3),
    .intro#connects .flow article:nth-of-type(4) {
      grid-column: 1 !important;
      min-height: 240px !important;
      border-right: 0 !important;
      border-bottom: 1px solid rgba(214,90,52,.16) !important;
    }

    .intro#connects .flow article:last-of-type {
      border-bottom: 0 !important;
    }

    .intro#connects .flow .ico {
      width: 86px !important;
      height: 86px !important;
      margin: 44px auto 24px !important;
      font-size: 34px !important;
    }

    .intro#connects .flow b {
      font-size: 23px !important;
      margin-bottom: 18px !important;
    }

    .intro#connects .flow small {
      font-size: 16px !important;
    }
    .section,
    .manifesto,
    .model,
    .story,
    .briefs,
    .principles,
    .why,
    .openings,
    .process,
    .control,
    .gifting,
    .swag,
    .stores,
    .recognition,
    .layout {
      padding-top: 36px !important;
      padding-bottom: 36px !important;
    }
  }
`;
const PAGE_TITLE: Record<MarketingPageKey, string> = {
  about: "About Shelf Merch - Built to Make Brand Moments Real",
  careers: "Careers at Shelf Merch - Current Openings",
  platform: "Shelf Merch Platform - Every Branded Moment",
  privacy: "Privacy Policy | Shelf Merch",
  terms: "Terms & Conditions | Shelf Merch",
};

function localizeMarkup(markup: string) {
  return markup
    .replaceAll("https://shelf-merch-homepage.konetibaba.chatgpt.site/", "/")
    .replaceAll("https://shelf-merch-homepage.konetibaba.chatgpt.site", "")
    .replaceAll('href="/platform"', 'href="/platform"')
    .replaceAll('href="/about"', 'href="/about"')
    .replaceAll('href="/terms"', 'href="/terms"')
    .replaceAll('href="/privacy"', 'href="/privacy"')
    .replaceAll('href="/careers"', 'href="/careers"')
    .replaceAll('href=""', 'href="/"');
}

function parsePage(html: string) {
  const doc = new DOMParser().parseFromString(localizeMarkup(html), "text/html");
  const style = Array.from(doc.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .join("\n");

  doc.querySelector("header")?.remove();
  doc.querySelector("footer")?.remove();
  doc.querySelectorAll("script").forEach((node) => node.remove());

  const bodyMarkup = doc.body.innerHTML;
  return { style, bodyMarkup };
}

function useShadowHashLinks(hostRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = hostRef.current;
    const root = host?.shadowRoot;
    if (!root) return;

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href^='#']");
      if (!link) return;

      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const targetId = decodeURIComponent(hash.slice(1));
      const section = root.getElementById(targetId);
      if (!section) return;

      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [hostRef]);
}

function useCareerFilters(hostRef: RefObject<HTMLDivElement | null>, page: MarketingPageKey) {
  useEffect(() => {
    if (page !== "careers") return;
    const host = hostRef.current;
    const root = host?.shadowRoot;
    if (!root) return;

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(".filters button");
      if (!button) return;

      const filter = button.dataset.filter ?? "all";
      root.querySelectorAll(".filters button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      root.querySelectorAll<HTMLElement>(".job").forEach((job) => {
        job.classList.toggle("hidden", filter !== "all" && job.dataset.team !== filter);
      });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [hostRef, page]);
}

function ShadowPageBody({ page }: { page: MarketingPageKey }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const parsed = useMemo(() => parsePage(PAGE_HTML[page]), [page]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;background:#f7f3ea;color:#121212;font-family:Arial,Helvetica,sans-serif}${parsed.style}${MARKETING_PAGE_NORMALIZE_CSS}</style>${parsed.bodyMarkup}`;
  }, [parsed]);

  useShadowHashLinks(hostRef);
  useCareerFilters(hostRef, page);

  return <div ref={hostRef} />;
}

export function MarketingHtmlPage({ page }: { page: MarketingPageKey }) {
  useEffect(() => {
    document.title = PAGE_TITLE[page];
  }, [page]);

  return (
    <div className="shelf-landing">
      <Header />
      <main style={{ paddingTop: 70 }}>
        <ShadowPageBody page={page} />
      </main>
      <Footer />
    </div>
  );
}

export function AboutPage() {
  return <MarketingHtmlPage page="about" />;
}

export function CareersPage() {
  return <MarketingHtmlPage page="careers" />;
}

export function PlatformMarketingPage() {
  return <MarketingHtmlPage page="platform" />;
}

export function PrivacyPage() {
  return <MarketingHtmlPage page="privacy" />;
}

export function TermsPage() {
  return <MarketingHtmlPage page="terms" />;
}



