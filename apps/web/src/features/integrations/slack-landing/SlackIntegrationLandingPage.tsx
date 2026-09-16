import { useEffect } from "react";
import { Link } from "react-router";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import "@/components/landing-page.css";
import "./slack-integration-landing.css";

const CONNECT_HREF = "/app/integrations";
const SLACK_ICON = "/images/logos/slack.svg";

/**
 * Public Slack Marketplace installation landing page.
 * Route: /integrations/slack
 */
export function SlackIntegrationLandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Connect ShelfMerch with Slack · ShelfMerch";
    window.scrollTo(0, 0);
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="slack-landing shelf-landing">
      <Header />

      <main>
        <section className="slack-landing__hero" aria-labelledby="slack-landing-title">
          <div className="slack-landing__hero-inner">
            <div className="slack-landing__hero-copy">
              <p className="slack-landing__eyebrow">
                <img src={SLACK_ICON} alt="" width={22} height={22} />
                Slack integration
              </p>
              <h1 id="slack-landing-title">Connect ShelfMerch with Slack</h1>
              <p className="slack-landing__lead">
                Bring your merchandise, swag, and employee gifting updates directly into your
                team&apos;s Slack workspace.
              </p>
              <div className="slack-landing__hero-actions">
                <Link className="slack-landing__btn slack-landing__btn--primary" to={CONNECT_HREF}>
                  Connect Slack
                </Link>
                <a className="slack-landing__btn slack-landing__btn--ghost" href="#features">
                  Learn More
                </a>
              </div>
            </div>
            <div className="slack-landing__hero-visual" aria-hidden="true">
              <div className="slack-landing__visual-panel">
                <div className="slack-landing__visual-top">
                  <span className="slack-landing__visual-dot" />
                  <span className="slack-landing__visual-dot" />
                  <span className="slack-landing__visual-dot" />
                  <em>#merch-updates</em>
                </div>
                <div className="slack-landing__visual-msg">
                  <img src={SLACK_ICON} alt="" width={28} height={28} />
                  <div>
                    <strong>ShelfMerch</strong>
                    <p>Budget allocated · ₹25,000 for Q3 recognition kits</p>
                  </div>
                </div>
                <div className="slack-landing__visual-msg">
                  <img src={SLACK_ICON} alt="" width={28} height={28} />
                  <div>
                    <strong>ShelfMerch</strong>
                    <p>Order dispatched · Welcome kit for 12 new joiners</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="slack-landing__section" id="features" aria-labelledby="features-heading">
          <div className="slack-landing__section-inner">
            <p className="slack-landing__kicker">Why connect</p>
            <h2 id="features-heading">Everything your merch program needs in Slack</h2>
            <div className="slack-landing__features">
              <article>
                <h3>Real-time Notifications</h3>
                <p>Receive instant updates about:</p>
                <ul>
                  <li>Budget allocations</li>
                  <li>Wallet updates</li>
                  <li>Order status changes</li>
                  <li>Merchandise activity</li>
                </ul>
              </article>
              <article>
                <h3>Workspace-Level Integration</h3>
                <p>
                  Connect your company&apos;s Slack workspace securely and choose where ShelfMerch
                  notifications should appear.
                </p>
              </article>
              <article>
                <h3>Secure &amp; Isolated</h3>
                <p>
                  Each company&apos;s Slack workspace is connected separately with encrypted
                  credentials and isolated data.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="slack-landing__section slack-landing__section--alt"
          id="how-it-works"
          aria-labelledby="how-heading"
        >
          <div className="slack-landing__section-inner">
            <p className="slack-landing__kicker">How it works</p>
            <h2 id="how-heading">Up and running in four steps</h2>
            <ol className="slack-landing__steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Connect Slack</h3>
                  <p>Click Connect Slack from your ShelfMerch account.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Authorize</h3>
                  <p>Authorize ShelfMerch in Slack.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Choose a channel</h3>
                  <p>Select your preferred notification channel.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>Get updates</h3>
                  <p>Receive ShelfMerch updates directly in Slack.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="slack-landing__section" id="security" aria-labelledby="security-heading">
          <div className="slack-landing__section-inner slack-landing__security">
            <p className="slack-landing__kicker">Security</p>
            <h2 id="security-heading">Built with security in mind</h2>
            <ul className="slack-landing__security-list">
              <li>OAuth-based Slack authentication</li>
              <li>Encrypted token storage</li>
              <li>Workspace-level permissions</li>
              <li>No access to private conversations</li>
            </ul>
          </div>
        </section>

        <section className="slack-landing__section slack-landing__section--alt" id="faq" aria-labelledby="faq-heading">
          <div className="slack-landing__section-inner">
            <p className="slack-landing__kicker">FAQ</p>
            <h2 id="faq-heading">Common questions</h2>
            <div className="slack-landing__faq">
              <details open>
                <summary>What Slack permissions does ShelfMerch use?</summary>
                <p>
                  ShelfMerch only requests permissions required to send notifications to your
                  selected Slack channels.
                </p>
              </details>
              <details>
                <summary>Can multiple companies connect their Slack workspace?</summary>
                <p>
                  Yes. Each company&apos;s Slack workspace is connected separately to maintain
                  complete data isolation.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="slack-landing__footer-cta" aria-labelledby="footer-cta-heading">
          <h2 id="footer-cta-heading">Ready to connect your workspace?</h2>
          <Link className="slack-landing__btn slack-landing__btn--primary" to={CONNECT_HREF}>
            Connect Slack
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
