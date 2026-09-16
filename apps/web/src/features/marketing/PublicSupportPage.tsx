import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import "@/components/landing-page.css";
import "./public-support.css";

const SUPPORT_EMAIL = "support@shelfmerch.com";
const MAILTO = `mailto:${SUPPORT_EMAIL}`;

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Public Support page — Slack App Support URL and general ShelfMerch help.
 * Route: /support
 */
export function PublicSupportPage() {
  useEffect(() => {
    const prevTitle = document.title;
    const prevDesc = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prevDescContent = prevDesc?.content ?? null;

    document.title = "ShelfMerch Support | Help Center";
    upsertMeta(
      "name",
      "description",
      "Get support for ShelfMerch integrations, Slack connection, account setup, and platform assistance.",
    );
    upsertMeta("property", "og:title", "ShelfMerch Support | Help Center");
    upsertMeta(
      "property",
      "og:description",
      "Get support for ShelfMerch integrations, Slack connection, account setup, and platform assistance.",
    );
    window.scrollTo(0, 0);

    return () => {
      document.title = prevTitle;
      if (prevDescContent == null) {
        document.head.querySelector('meta[name="description"]')?.remove();
      } else if (prevDesc) {
        prevDesc.content = prevDescContent;
      }
    };
  }, []);

  return (
    <div className="public-support shelf-landing">
      <Header />

      <main>
        <section className="public-support__hero" aria-labelledby="support-title">
          <div className="public-support__hero-inner">
            <p className="public-support__kicker">Help Center</p>
            <h1 id="support-title">Need help with ShelfMerch?</h1>
            <p className="public-support__lead">
              Our support team is here to help you with account setup, integrations, Slack
              notifications, and any questions about using ShelfMerch.
            </p>
            <a className="public-support__btn" href={MAILTO}>
              Contact Support
            </a>
          </div>
        </section>

        <section className="public-support__section" aria-labelledby="support-options-heading">
          <div className="public-support__inner">
            <p className="public-support__kicker">How we can help</p>
            <h2 id="support-options-heading">Support options</h2>
            <div className="public-support__options">
              <article>
                <h3>Slack Integration Support</h3>
                <p>
                  Need help connecting Slack, managing notifications, or troubleshooting your
                  workspace connection?
                </p>
              </article>
              <article>
                <h3>Account &amp; Product Support</h3>
                <p>
                  Get assistance with your ShelfMerch account, orders, budgets, catalogs, and
                  platform features.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="public-support__section public-support__section--alt"
          aria-labelledby="contact-heading"
        >
          <div className="public-support__inner public-support__contact">
            <p className="public-support__kicker">Get in touch</p>
            <h2 id="contact-heading">Contact Support</h2>

            <dl className="public-support__details">
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={MAILTO}>{SUPPORT_EMAIL}</a>
                </dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>
                  Shelf Merch
                  <br />
                  A platform by Chitlu Innovations Private Limited
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  Win Win Towers, HiTech City Road,
                  <br />
                  Madhapur, Hyderabad, Telangana, India 500089
                </dd>
              </div>
            </dl>

            <a className="public-support__btn" href={MAILTO}>
              Contact Support
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}