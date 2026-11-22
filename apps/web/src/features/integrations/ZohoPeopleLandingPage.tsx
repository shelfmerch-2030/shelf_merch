import { Link } from "react-router";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import "@/components/landing-page.css";
import "@/components/landing-home.css";
import "./zoho-people-landing.css";

const docsPath = "/docs/zoho-people";
const supportEmail = "support@shelfmerch.com";

export function ZohoPeopleLandingPage() {
  return (
    <div className="shelf-landing zoho-people-landing">
      <Header />
      <main>
        <div className="landing-home">
          <section className="lh-hero zoho-people-hero" aria-labelledby="zoho-people-title">
            <div className="lh-wrap lh-hero-grid">
              <div>
                <h1 id="zoho-people-title">
                  <span>ShelfMerch Integration</span> <em>for Zoho People</em>
                </h1>
                <p>
                  Bring your Zoho People employee directory into ShelfMerch. Sync records on demand
                  for corporate gifting, onboarding kits, and employee recognition.
                </p>
                <div className="lh-actions">
                  <Link className="lh-button lh-button-white" to="/signup">
                    Signup
                  </Link>
                  <Link className="lh-button lh-button-hero-outline" to="/login">
                    Login
                  </Link>
                </div>
              </div>
              <div className="lh-hero-visual">
                <img
                  className="lh-hero-image"
                  src="/images/resources/zoho/zoho-overview-hero-v1.png"
                  alt=""
                  width={1536}
                  height={1024}
                />
              </div>
            </div>
          </section>
        </div>

        <section
          className="zoho-people-inner zoho-people-section zoho-people-workflow"
          aria-labelledby="zoho-people-steps"
        >
          <div className="zoho-people-workflow-heading">
            <h2 id="zoho-people-steps">How It Works</h2>
            <Link className="zoho-people-resource" to={docsPath}>
              Zoho People documentation <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <ol className="zoho-people-steps" role="list">
            <li>
              <h3>Connect with Zoho OAuth</h3>
              <p>
                As a company administrator, open Integrations in ShelfMerch, select Zoho People, and
                approve read access to your employee and organisation data.
              </p>
            </li>
            <li>
              <h3>Sync employees manually</h3>
              <p>
                Select <strong>Sync now</strong> to import or update employee records from Zoho
                People in your ShelfMerch workspace. Repeat when you need to refresh the directory.
              </p>
            </li>
            <li>
              <h3>Choose recipients</h3>
              <p>
                Use imported employees as recipients for welcome kits, corporate gifts, and
                recognition rewards.
              </p>
            </li>
          </ol>
        </section>

        <div className="zoho-people-details">
          <div className="zoho-people-inner zoho-people-details-grid">
            <section
              className="zoho-people-detail-card zoho-people-pricing"
              aria-labelledby="zoho-people-pricing"
            >
              <h2 id="zoho-people-pricing">Pricing</h2>
              <p>
                Contact ShelfMerch sales for a quote and details on any applicable integration fees.
              </p>
              <Link className="button button-dark" to="/request-demo">
                Contact sales for pricing
              </Link>
            </section>
            <section className="zoho-people-detail-card" aria-labelledby="zoho-people-support">
              <h2 id="zoho-people-support">Vendor and support</h2>
              <p>Chitlu Innovations Private Limited</p>
              <dl className="zoho-people-contacts">
                <div>
                  <dt>Support email</dt>
                  <dd>
                    <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                  </dd>
                </div>
                <div>
                  <dt>Company phone</dt>
                  <dd>
                    <a href="tel:+918887222888">+91 8887222888</a>
                  </dd>
                </div>
              </dl>
              <h3 className="zoho-people-developer-heading">Developer support</h3>
              <p>
                For developer support with OAuth, permissions, or sync errors, email the integration
                support team with your workspace name and the error message.
              </p>
              <ul className="zoho-people-links">
                <li>
                  <a href={`mailto:${supportEmail}?subject=Zoho%20People%20integration%20support`}>
                    Email developer support
                  </a>
                </li>
                <li>
                  <Link to={`${docsPath}/admin-guide`}>Administrator guide</Link>
                </li>
                <li>
                  <Link to="/support">ShelfMerch support center</Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
        <div className="landing-home">
          <section className="lh-final zoho-people-final" aria-labelledby="zoho-people-final-title">
            <div className="lh-wrap">
              <span className="lh-label">ONE PARTNER. EVERY MOMENT.</span>
              <h2 id="zoho-people-final-title">
                Your next branded moment <em>belongs on the shelf.</em>
              </h2>
              <p>
                From a first idea to a delivered gift, let&apos;s build something people will be
                happy to keep.
              </p>
              <Link className="lh-button lh-button-white" to="/request-demo">
                Let&apos;s plan your next moment
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
