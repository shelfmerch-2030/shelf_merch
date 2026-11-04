import { Link } from "react-router";
import { DocsHeading, DocsShell } from "../DocsShell";
import { useDocsMeta } from "../useDocsMeta";
import { BookOpen, ShieldCheck } from "lucide-react";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import zohoPeopleLogo from "../../../../assets/integrations/zoho-people.png";
import "./zoho-admin-guide.css";
import "./zoho-docs-overview.css";

export function ZohoPeopleDocsHomePage() {
  useDocsMeta({
    title: "ShelfMerch for Zoho People · Documentation",
    description:
      "Sync employees from Zoho People into ShelfMerch for onboarding kits, rewards, and corporate gifting.",
    canonicalPath: "/docs/zoho-people",
    ogTitle: "ShelfMerch for Zoho People Documentation",
    ogDescription:
      "Connect Zoho People to ShelfMerch, sync employees, and streamline onboarding and corporate gifting.",
  });

  return (
    <DocsShell
      className="zoho-admin-guide zoho-docs-overview"
      activePath="/docs/zoho-people"
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "Zoho People docs" },
      ]}
    >
      <header className="zag-hero">
        <div className="zag-hero-copy">
          <span className="zag-eyebrow"><BookOpen size={18} aria-hidden="true" /> INTEGRATION DOCUMENTATION</span>
      <h1>ShelfMerch for <em>Zoho People</em></h1>
      <p className="docs-sub">Sync employees and streamline onboarding and corporate gifting.</p>
          <span className="zag-hero-note"><ShieldCheck size={18} aria-hidden="true" /> Connect. Sync. Get started.</span>
        </div>
        <div className="zag-hero-visual">
          <div className="zag-partner-logos">
            <img src={zohoPeopleLogo} alt="Zoho People" />
            <span aria-hidden="true">+</span>
            <ShelfMerchLogo height={26} theme="dark" />
          </div>
          <img className="zag-welcome-art" src="/images/resources/zoho/zoho-onboarding-hero.webp"
            alt="An HR colleague welcoming an employee with a merchandise kit" width="1536" height="1024" />
        </div>
      </header>
      <p>
        <strong>ShelfMerch for Zoho People</strong> allows authorised company administrators to import
        and update employee records from Zoho People. Synced employees can be managed as recipients for
        onboarding kits, employee rewards, corporate gifts, and branded merchandise.
      </p>

      <DocsHeading id="documentation">Documentation</DocsHeading>
      <div className="docs-cards">
        <Link className="docs-card" to="/docs/zoho-people/user-guide">
          <strong>User Guide</strong>
          <span>Sign in, connect, sync, and disconnect step by step.</span>
        </Link>
        <Link className="docs-card" to="/docs/zoho-people/admin-guide">
          <strong>Administrator Guide</strong>
          <span>Permissions, security, mapping, and tenant isolation.</span>
        </Link>
        <Link className="docs-card" to="/docs/zoho-people/user-guide#connecting">
          <strong>Installation and Connection</strong>
          <span>Connect Zoho People through OAuth from the Web Tab.</span>
        </Link>
        <Link className="docs-card" to="/docs/zoho-people/user-guide#syncing">
          <strong>Employee Synchronisation</strong>
          <span>Import and update employees into ShelfMerch contacts.</span>
        </Link>
        <Link className="docs-card" to="/docs/zoho-people/user-guide#errors">
          <strong>Troubleshooting</strong>
          <span>Common errors and practical fixes.</span>
        </Link>
        <Link className="docs-card" to="/legal/privacy-policy">
          <strong>Privacy and Data Handling</strong>
          <span>How employee and integration data is processed.</span>
        </Link>
        <a className="docs-card" href="mailto:support@shelfmerch.com">
          <strong>Contact Support</strong>
          <span>support@shelfmerch.com</span>
        </a>
      </div>

      <DocsHeading id="features">Key features</DocsHeading>
      <ul>
        <li>Secure Zoho OAuth connection</li>
        <li>Employee import and update</li>
        <li>Duplicate record prevention using Zoho employee identifiers</li>
        <li>Organisation and last-sync status</li>
        <li>Onboarding kit recipient management</li>
        <li>Employee rewards and corporate gifting</li>
        <li>Manual employee synchronisation</li>
        <li>Secure disconnection</li>
      </ul>

      <DocsHeading id="get-started">Get started</DocsHeading>
      <p>Choose the guide that matches your role:</p>
      <p>
        <Link className="docs-cta" to="/docs/zoho-people/user-guide">
          Open User Guide
        </Link>
        <Link className="docs-cta docs-cta--ghost" to="/docs/zoho-people/admin-guide">
          Open Administrator Guide
        </Link>
        <Link className="docs-cta docs-cta--ghost" to="/case-studies/zoho-people">
          View example workflow
        </Link>
      </p>
      <p>
        Product by Chitlu Innovations Private Limited ·{" "}
        <a href="https://shelfmerch.io">https://shelfmerch.io</a>
      </p>
    </DocsShell>
  );
}
