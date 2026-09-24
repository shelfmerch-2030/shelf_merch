import { Link } from "react-router";
import type { CSSProperties, ReactNode } from "react";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import authMerchImage from "@/assets/auth-merch-login.png";

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** `welcome` = merch backdrop + card with wordmark above (login / signup). `compact` = smaller card for reset flows. */
  variant?: "branded" | "welcome" | "compact";
  /** Keep the screen inside the viewport (login). */
  lockScroll?: boolean;
  footerLink?: { hint: string; label: string; to: "/login" | "/signup" | "/forgot-password" };
};

export function AuthLayout({
  children,
  title,
  subtitle,
  variant = "branded",
  lockScroll = false,
  footerLink,
}: AuthLayoutProps) {
  const isWelcome = variant === "welcome";
  const isCompact = variant === "compact";
  const authBackgroundStyle = {
    "--auth-bg": `url(${authMerchImage})`,
  } as CSSProperties;

  return (
    <div
      className={`auth-simple${isWelcome ? " auth-simple--welcome" : ""}${isCompact ? " auth-simple--compact" : ""}${lockScroll ? " auth-simple--noscroll" : ""}`}
      style={authBackgroundStyle}
    >
      <div className="auth-simple-body">
        <div className="auth-simple-shell">
          <section className="auth-simple-art" aria-label="Shelf Merch branded merchandise">
            {isWelcome ? (
              <div className="auth-brand-caption">
                <p className="auth-brand-caption__lead">Every gift,</p>
                <p className="auth-brand-caption__highlight">
                  <span>one shelf.</span>
                </p>
                <p className="auth-brand-caption__tag">Made for gifting teams everywhere.</p>
              </div>
            ) : (
              <img src={authMerchImage} alt="" className="auth-simple-art-img" />
            )}
          </section>

          {isWelcome ? (
            <div className="auth-simple-form-col">
              <Link to="/" className="auth-welcome-brand" aria-label="Shelf Merch home">
                <img
                  src="/images/logo/shelfmerch-wordmark-transparent.png"
                  alt=""
                  className="auth-welcome-brand__logo"
                />
              </Link>
              <section className="auth-simple-card">
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
          ) : (
            <section className="auth-simple-card">
              <Link to="/" className="auth-simple-logo" aria-label="Shelf Merch home">
                <ShelfMerchLogo height={isCompact ? 32 : 42} className="auth-simple-logo-img" />
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
          )}
        </div>
      </div>
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
