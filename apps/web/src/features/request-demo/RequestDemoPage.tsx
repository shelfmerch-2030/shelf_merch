import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Home,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { ApiError, publicFetch } from "@/services/api";
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

const nextSteps = [
  "Our team reviews your request",
  "A Shelf Merch specialist contacts you",
  "We understand your swag requirements",
  "We schedule a personalised platform demo",
];

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function RequestDemoPage() {
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [submittedFirstName, setSubmittedFirstName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "submitting" || submitState === "success") return;

    const currentForm = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const companyName = String(form.get("companyName") ?? "").trim();
    const workEmail = String(form.get("workEmail") ?? "").trim();
    const mobileNumber = String(form.get("mobileNumber") ?? "").trim();
    const requirement = String(form.get("requirement") ?? "").trim();

    setSubmitState("submitting");
    setMessage("");

    try {
      await publicFetch("/demo-leads", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          companyName,
          workEmail,
          mobileNumber,
          requirement: requirement || undefined,
        }),
      });

      currentForm.reset();
      setSubmittedFirstName(getFirstName(fullName));
      setSubmitState("success");
      setMessage("");
    } catch (error) {
      setSubmitState("error");
      const isValidation =
        error instanceof ApiError && (error.status === 400 || error.code === "VALIDATION_ERROR");
      setMessage(
        isValidation && error instanceof ApiError
          ? error.message
          : "Something went wrong while submitting your request. Please try again.",
      );
    }
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
          {submitState === "success" ? (
            <div className="request-demo__success" role="status">
              <span className="request-demo__success-icon" aria-hidden="true">
                <Check size={26} strokeWidth={3} />
              </span>
              <div className="request-demo__success-copy">
                <h2 id="demo-form-title">Request received!</h2>
                <p className="request-demo__success-subtitle">We&apos;ll be in touch soon.</p>
                <p>
                  Thanks, <strong>{submittedFirstName}</strong>. A Shelf Merch specialist will
                  contact you shortly to understand your requirements and schedule your
                  personalised demo.
                </p>

                <div className="request-demo__next-steps">
                  <h3>What happens next?</h3>
                  <ul>
                    {nextSteps.map((step) => (
                      <li key={step}>
                        <span aria-hidden="true">
                          <Check size={14} strokeWidth={3} />
                        </span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="request-demo__success-confirm">
                  <span aria-hidden="true">✓</span> Your request has been submitted successfully.
                </p>
              </div>

              <div className="request-demo__success-actions">
                <Link
                  className="request-demo__success-action request-demo__success-action--primary"
                  to="/"
                >
                  Back to Home
                  <span aria-hidden="true">
                    <Home size={18} />
                  </span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="request-demo__form-heading">
                <span>REQUEST A DEMO</span>
                <h2 id="demo-form-title">Tell us about your team.</h2>
                <p>
                  We&apos;ll tailor the conversation to your goals, team size and gifting needs.
                </p>
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
                    disabled={submitState === "submitting"}
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
                    disabled={submitState === "submitting"}
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
                    disabled={submitState === "submitting"}
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
                    disabled={submitState === "submitting"}
                  />
                </div>

                <div className="request-demo__field">
                  <label htmlFor="demo-requirement">
                    What are you looking for? <small>(Optional)</small>
                  </label>
                  <div className="request-demo__select-wrap">
                    <select
                      id="demo-requirement"
                      name="requirement"
                      defaultValue=""
                      disabled={submitState === "submitting"}
                    >
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

                <button
                  type="submit"
                  className="request-demo__submit"
                  disabled={submitState === "submitting"}
                  aria-busy={submitState === "submitting"}
                >
                  {submitState === "submitting" ? "Submitting..." : "Request a Demo"}
                  <span aria-hidden="true">
                    <ArrowUpRight size={18} />
                  </span>
                </button>

                {message ? (
                  <p
                    className={`request-demo__form-status request-demo__form-status--${submitState}`}
                    role="alert"
                  >
                    {message}
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}