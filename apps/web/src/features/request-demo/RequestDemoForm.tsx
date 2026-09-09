import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronDown, Home, MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { ApiError, publicFetch } from "@/services/api";
import {
  buildRequestDemoWhatsAppHref,
  buildRequestDemoWhatsAppMessage,
  getRequestDemoFirstName,
  requestDemoNextSteps,
  requestDemoRequirements,
  type DemoLeadFormValues,
} from "./model";
import "./request-demo.css";

type RequestDemoFormProps = {
  titleId?: string;
  variant?: "page" | "landing";
  showHeading?: boolean;
  submitLabel?: string;
  whatsAppLabel?: string;
  consentText?: string;
  commitmentText?: string;
  idPrefix?: string;
};

function readLeadFormValues(form: HTMLFormElement): DemoLeadFormValues {
  const formData = new FormData(form);
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    companyName: String(formData.get("companyName") ?? "").trim(),
    workEmail: String(formData.get("workEmail") ?? "").trim(),
    mobileNumber: String(formData.get("mobileNumber") ?? "").trim(),
    requirement: String(formData.get("requirement") ?? "").trim(),
  };
}

function openWhatsApp(values?: Partial<DemoLeadFormValues>) {
  const href = buildRequestDemoWhatsAppHref(buildRequestDemoWhatsAppMessage(values));
  window.open(href, "_blank", "noopener,noreferrer");
}

export function RequestDemoForm({
  titleId = "demo-form-title",
  variant = "page",
  showHeading = true,
  submitLabel = "Request a Demo",
  whatsAppLabel = "Prefer WhatsApp? Chat now",
  consentText = "By submitting this form, you agree to be contacted by Shelf Merch regarding your enquiry.",
  commitmentText = "No payment or commitment is required.",
  idPrefix = "demo",
}: RequestDemoFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [submittedFirstName, setSubmittedFirstName] = useState("");
  const [submittedLead, setSubmittedLead] = useState<DemoLeadFormValues | null>(null);
  const isSubmitting = submitState === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "submitting" || submitState === "success") return;

    const currentForm = event.currentTarget;
    const values = readLeadFormValues(currentForm);

    setSubmitState("submitting");
    setMessage("");

    try {
      await publicFetch("/demo-leads", {
        method: "POST",
        body: JSON.stringify({
          fullName: values.fullName,
          companyName: values.companyName,
          workEmail: values.workEmail,
          mobileNumber: values.mobileNumber,
          requirement: values.requirement || undefined,
        }),
      });

      currentForm.reset();
      setSubmittedFirstName(getRequestDemoFirstName(values.fullName));
      setSubmittedLead(values);
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

  function handleWhatsAppClick() {
    const values = formRef.current ? readLeadFormValues(formRef.current) : undefined;
    openWhatsApp(values);
  }

  if (submitState === "success") {
    return (
      <div className={`request-demo__success request-demo__success--${variant}`} role="status">
        <span className="request-demo__success-icon" aria-hidden="true">
          <Check size={26} strokeWidth={3} />
        </span>
        <div className="request-demo__success-copy">
          <h2 id={titleId}>Request received!</h2>
          <p className="request-demo__success-subtitle">We&apos;ll be in touch soon.</p>
          <p>
            Thanks, <strong>{submittedFirstName}</strong>. A Shelf Merch specialist will contact
            you shortly to understand your requirements and schedule your personalised demo.
          </p>

          <div className="request-demo__next-steps">
            <h3>What happens next?</h3>
            <ul>
              {requestDemoNextSteps.map((step) => (
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
            <span aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            Your request has been submitted successfully.
          </p>
        </div>

        <div className="request-demo__success-actions">
          <a
            className="request-demo__success-action request-demo__success-action--primary"
            href={buildRequestDemoWhatsAppHref(
              buildRequestDemoWhatsAppMessage(submittedLead ?? undefined),
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chat on WhatsApp
            <span aria-hidden="true">
              <MessageCircle size={18} />
            </span>
          </a>
          <Link
            className="request-demo__success-action request-demo__success-action--secondary"
            to="/"
          >
            Return to Homepage
            <span aria-hidden="true">
              <Home size={18} />
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {showHeading ? (
        <div className="request-demo__form-heading">
          <span>REQUEST A DEMO</span>
          <h2 id={titleId}>Tell us about your team.</h2>
          <p>We&apos;ll tailor the conversation to your goals, team size and gifting needs.</p>
        </div>
      ) : (
        <h2 id={titleId} className="request-demo__visually-hidden">
          Tell us about your team.
        </h2>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`request-demo__form request-demo__form--${variant}`}
      >
        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-full-name`}>
            Full Name<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-full-name`}
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder={variant === "landing" ? "Your full name" : "Enter your full name"}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-company-name`}>
            Company Name<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-company-name`}
            name="companyName"
            type="text"
            autoComplete="organization"
            placeholder={variant === "landing" ? "Company name" : "Enter your company name"}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-email`}>
            Work Email<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-email`}
            name="workEmail"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={variant === "landing" ? "you@company.com" : "name@company.com"}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field">
          <label htmlFor={`${idPrefix}-mobile`}>
            Mobile Number<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idPrefix}-mobile`}
            name="mobileNumber"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={variant === "landing" ? "+91 98765 43210" : "Enter your mobile number"}
            pattern="[0-9+() -]{7,20}"
            title="Enter a valid mobile number"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="request-demo__field request-demo__field--wide">
          <label htmlFor={`${idPrefix}-requirement`}>What are you looking for?</label>
          <div className="request-demo__select-wrap">
            <select
              id={`${idPrefix}-requirement`}
              name="requirement"
              defaultValue=""
              disabled={isSubmitting}
            >
              <option value="">Select a requirement</option>
              {requestDemoRequirements.map((requirement) => (
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
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Submitting..." : submitLabel}
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

        <p className="request-demo__consent">{consentText}</p>

        <div className="request-demo__whatsapp-divider" aria-hidden="true">
          <span />
          OR
          <span />
        </div>

        <button
          type="button"
          className="request-demo__whatsapp-button"
          onClick={handleWhatsAppClick}
        >
          <MessageCircle size={22} aria-hidden="true" />
          {whatsAppLabel}
        </button>

        <p className="request-demo__commitment">
          <Check size={14} aria-hidden="true" /> {commitmentText}
        </p>
      </form>
    </>
  );
}
