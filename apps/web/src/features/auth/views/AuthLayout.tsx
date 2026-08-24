import { Link } from "react-router";
import type { ReactNode } from "react";
import { Gift, Globe2, Headset, ShieldCheck } from "lucide-react";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import authMerchImage from "@/assets/auth-merch-login.png";

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  footerLink?: { hint: string; label: string; to: "/login" | "/signup" | "/forgot-password" };
};

export function AuthLayout({ children, title, subtitle, footerLink }: AuthLayoutProps) {
  return (
    <div className="auth-simple">
      <div className="auth-simple-body">
        <div className="auth-simple-shell">
          <section className="auth-simple-art" aria-label="Shelf Merch branded merchandise">
            <img src={authMerchImage} alt="" className="auth-simple-art-img" />
          </section>

          <section className="auth-simple-card">
            <Link to="/" className="auth-simple-logo" aria-label="Shelf Merch home">
              <ShelfMerchLogo height={42} className="auth-simple-logo-img" />
            </Link>

            <h1 className="auth-simple-title">{title}</h1>
            {subtitle ? <p className="auth-simple-subtitle">{subtitle}</p> : null}

            {children}

            {footerLink ? (
              <p className="auth-simple-switch">
                {footerLink.hint ? <>{footerLink.hint} </> : null}
                <Link to={footerLink.to} className="auth-simple-switch-link">
                  {footerLink.label}
                </Link>
              </p>
            ) : null}
          </section>
        </div>

        <div className="auth-simple-benefits" aria-label="Shelf Merch benefits">
          <span>
            <i><Gift size={22} strokeWidth={1.8} /></i>
            <b>Branded Gifting</b>
            <small>Made simple</small>
          </span>
          <span>
            <i><Globe2 size={22} strokeWidth={1.8} /></i>
            <b>Pan-India</b>
            <small>Delivery</small>
          </span>
          <span>
            <i><ShieldCheck size={22} strokeWidth={1.8} /></i>
            <b>Enterprise-Grade</b>
            <small>Security</small>
          </span>
          <span>
            <i><Headset size={22} strokeWidth={1.8} /></i>
            <b>Dedicated</b>
            <small>Support</small>
          </span>
        </div>
      </div>

      <footer className="auth-simple-footer">
        <Link to="/legal/terms-of-service" className="auth-simple-footer-link">
          Terms of Service
        </Link>
        <Link to="/legal/privacy-policy" className="auth-simple-footer-link">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}

export function AuthLabel({
  htmlFor,
  children,
  action,
}: {
  htmlFor?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="auth-simple-label-row">
      <label htmlFor={htmlFor} className="auth-simple-label">
        {children}
      </label>
      {action}
    </div>
  );
}

export const authInputClassName = "auth-simple-input";
