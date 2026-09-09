import { CheckCircle2, Mail, MapPin, MessageCircle, PackageCheck } from "lucide-react";
import { RequestDemoForm } from "@/features/request-demo/RequestDemoForm";

const highlights = [
  { label: "No payment or commitment", icon: CheckCircle2 },
  { label: "One team from design to delivery", icon: PackageCheck },
  { label: "Pan-India support", icon: MapPin },
];

export function MerchPlan() {
  return (
    <section className="landing-plan" id="contact" aria-labelledby="landing-plan-title">
      <div className="landing-plan__image" aria-hidden="true">
        <img src="/images/landing/hero.png" alt="" />
      </div>

      <div className="landing-plan__copy">
        <h2 id="landing-plan-title">
          Tell us what
          <br />
          you need.
          <em>
            We&apos;ll build the
            <br />
            merch plan.
          </em>
        </h2>

        <ul className="landing-plan__highlights">
          {highlights.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span aria-hidden="true">
                <Icon size={19} strokeWidth={2.4} />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <a className="landing-plan__email" href="mailto:supported@shelfmerch.com">
          <Mail size={20} aria-hidden="true" />
          supported@shelfmerch.com
        </a>
      </div>

      <div className="landing-plan__form-card" aria-labelledby="landing-plan-form-title">
        <RequestDemoForm
          titleId="landing-plan-form-title"
          idPrefix="landing-plan"
          variant="landing"
          showHeading={false}
          submitLabel="Send my requirement"
          consentText="Your details open as a prefilled WhatsApp message. Nothing is shared until you tap Send."
          whatsAppLabel="Prefer WhatsApp? Chat now"
          commitmentText="No payment or commitment"
        />
      </div>

      {/* <a
        className="landing-plan__floating-whatsapp"
        href="https://wa.me/917801087402"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle size={25} aria-hidden="true" />
        WhatsApp
      </a> */}
    </section>
  );
}
