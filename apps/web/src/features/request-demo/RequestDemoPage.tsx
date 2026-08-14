import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import "./request-demo.css";

const capabilities = [
  "Branded company stores",
  "Employee onboarding kits",
  "On-demand and bulk swag",
  "Rewards and milestone gifting",
  "Department budgets and approvals",
  "Prospect and client gifting",
  "Pan-India production and fulfilment",
];

const requirements = [
  "Company Swag Store",
  "Employee Onboarding Kits",
  "Rewards and Recognition",
  "Bulk Swag Orders",
  "Prospect and Client Gifting",
  "Multiple Requirements",
];

export function RequestDemoPage() {
  const [emailReady, setEmailReady] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const companyName = String(form.get("companyName") ?? "").trim();
    const workEmail = String(form.get("workEmail") ?? "").trim();
    const mobileNumber = String(form.get("mobileNumber") ?? "").trim();
    const requirement = String(form.get("requirement") ?? "Not specified");

    const subject = encodeURIComponent(`Demo request from ${companyName}`);
    const body = encodeURIComponent(
      [
        "Hello Shelf Merch team,",
        "",
        "I'd like to request a personalised platform demo.",
        "",
        `Full name: ${fullName}`,
        `Company: ${companyName}`,
        `Work email: ${workEmail}`,
        `Mobile number: ${mobileNumber}`,
        `Interested in: ${requirement || "Not specified"}`,
      ].join("\n"),
    );

    setEmailReady(true);
    window.location.href = `mailto:hello@shelfmerch.io?subject=${subject}&body=${body}`;
  }

  return (
    <main className="request-demo">
      <header className="request-demo__header">
        <Link to="/" aria-label="Shelf Merch home" className="request-demo__logo">
          <ShelfMerchLogo height={28} />
        </Link>
        <Link to="/" className="request-demo__back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
      </header>

      <div className="request-demo__shell">
        <section className="request-demo__intro" aria-labelledby="request-demo-title">
          <div className="request-demo__eyebrow">
            <span aria-hidden="true">
              <Sparkles size={14} />
            </span>
            Shelf Merch corporate swag platform
          </div>

          <h1 id="request-demo-title">
            Let&apos;s build your
            <br />
            company&apos;s <em>swag portal.</em>
          </h1>

          <p className="request-demo__lead">
            Tell us a little about your company. Our swag specialist will contact you to understand
            your requirements and schedule a personalised platform demo.
          </p>

          <div className="request-demo__capabilities">
            <p>With Shelf Merch, you can manage:</p>
            <ul>
              {capabilities.map((capability) => (
                <li key={capability}>
                  <span aria-hidden="true">
                    <Check size={15} strokeWidth={3} />
                  </span>
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <div className="request-demo__preview" aria-hidden="true">
            <div className="request-demo__preview-copy">
              <span>YOUR COMPANY STORE</span>
              <strong>
                Good merch.
                <br />
                Great culture.
              </strong>
              <small>Designed, stored and shipped by Shelf Merch.</small>
            </div>
            <div className="request-demo__products">
              <img src="/images/landing/hero.png" alt="" />
            </div>
            <span className="request-demo__preview-chip">Live in days, not months</span>
          </div>
        </section>

        <section className="request-demo__form-card" aria-labelledby="demo-form-title">
          <div className="request-demo__form-heading">
            <span>REQUEST A DEMO</span>
            <h2 id="demo-form-title">Tell us about your team.</h2>
            <p>We&apos;ll tailor the conversation to your goals, team size and gifting needs.</p>
          </div>

          <form onSubmit={handleSubmit} className="request-demo__form">
            <div className="request-demo__field">
              <label htmlFor="demo-full-name">
                Full Name<span aria-hidden="true">*</span>
              </label>
              <input
                id="demo-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="request-demo__field">
              <label htmlFor="demo-company-name">
                Company Name<span aria-hidden="true">*</span>
              </label>
              <input
                id="demo-company-name"
                name="companyName"
                type="text"
                autoComplete="organization"
                placeholder="Enter your company name"
                required
              />
            </div>

            <div className="request-demo__field">
              <label htmlFor="demo-email">
                Work Email Address<span aria-hidden="true">*</span>
              </label>
              <input
                id="demo-email"
                name="workEmail"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@company.com"
                required
              />
            </div>

            <div className="request-demo__field">
              <label htmlFor="demo-mobile">
                Mobile Number<span aria-hidden="true">*</span>
              </label>
              <input
                id="demo-mobile"
                name="mobileNumber"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="Enter your mobile number"
                pattern="[0-9+() -]{7,20}"
                title="Enter a valid mobile number"
                required
              />
            </div>

            <div className="request-demo__field">
              <label htmlFor="demo-requirement">
                What are you looking for? <small>(Optional)</small>
              </label>
              <div className="request-demo__select-wrap">
                <select id="demo-requirement" name="requirement" defaultValue="">
                  <option value="">Select a requirement</option>
                  {requirements.map((requirement) => (
                    <option key={requirement} value={requirement}>
                      {requirement}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
            </div>

            <button type="submit" className="request-demo__submit">
              Request a Demo
              <span aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
            </button>

            {emailReady ? (
              <p className="request-demo__email-status" role="status">
                Your email app should open with the details filled in. Send that email to complete
                your request.
              </p>
            ) : null}

            <p className="request-demo__consent">
              By submitting this form, you agree to be contacted by Shelf Merch regarding your
              enquiry.
            </p>
            <p className="request-demo__commitment">
              <Check size={14} aria-hidden="true" /> No payment or commitment is required.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
