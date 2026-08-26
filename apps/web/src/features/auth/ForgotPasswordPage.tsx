import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, CheckCircle2 } from "lucide-react";
import { requestPasswordReset, ApiError } from "@/services/api-bridge";
import { AuthLabel, AuthLayout, authInputClassName } from "./views/AuthLayout";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const emailError = useMemo(() => {
    if (!touched && !busy) return "";
    if (!email.trim()) return "Email address is required.";
    if (!isValidEmail(email)) return "Enter a valid email address.";
    return "";
  }, [email, touched, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!email.trim() || !isValidEmail(email) || busy) return;

    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many reset requests. Please wait and try again later.");
      } else if (err instanceof TypeError) {
        setError("Cannot reach the server. Please try again shortly.");
      } else {
        // Still show the success path messaging for anything sensitive.
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      variant="welcome"
      title={sent ? "Check your email" : "Forgot your password?"}
      subtitle={
        sent
          ? undefined
          : "Enter your work email and we’ll send a link to reset your password."
      }
      footerLink={
        sent
          ? undefined
          : { hint: "Remembered it?", label: "Back to Login", to: "/login" }
      }
    >
      {sent ? (
        <div className="auth-success-panel" role="status">
          <CheckCircle2 className="auth-success-icon" size={48} strokeWidth={1.75} aria-hidden="true" />
          <p className="auth-success-copy">
            If an account exists with this email, a password reset link has been sent.
          </p>
          <button type="button" className="auth-simple-submit" onClick={() => navigate("/login")}>
            Back to Login
          </button>
        </div>
      ) : (
        <form className="auth-simple-form" onSubmit={onSubmit} aria-busy={busy} noValidate>
          <fieldset className="auth-simple-fieldset" disabled={busy}>
            <div className="auth-simple-field">
              <AuthLabel htmlFor="forgot-email">Work email</AuthLabel>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                className={`${authInputClassName}${emailError ? " auth-simple-input--invalid" : ""}`}
                autoFocus
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "forgot-email-error" : undefined}
              />
              {emailError ? (
                <p id="forgot-email-error" className="auth-field-error" role="alert">
                  {emailError}
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="auth-simple-error auth-simple-error--shake" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="auth-simple-submit"
              disabled={busy || Boolean(emailError) || !email.trim()}
            >
              {busy ? (
                <span className="auth-submit-busy">
                  <Loader2 size={18} className="auth-spin" aria-hidden="true" />
                  Sending…
                </span>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </fieldset>
        </form>
      )}
    </AuthLayout>
  );
}
