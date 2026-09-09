import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { RequestDemoForm } from "./RequestDemoForm";
import { requestDemoCapabilities } from "./model";
import "./request-demo.css";

export function RequestDemoPage() {
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
              {requestDemoCapabilities.map((capability) => (
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
          <RequestDemoForm titleId="demo-form-title" />
        </section>
      </div>
    </main>
  );
}
