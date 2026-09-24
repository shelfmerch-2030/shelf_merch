import { Link } from "react-router";
import { PasswordField } from "../components/PasswordField";
import type { SignupVm } from "../controllers/useSignupController";
import { AuthLabel, AuthLayout, authInputClassName } from "./AuthLayout";

function inputClass(invalid: boolean) {
  return `${authInputClassName}${invalid ? " auth-simple-input--invalid" : ""}`;
}

function FieldError({ id, message }: { id: string; message: string }) {
  if (!message) return null;
  return (
    <p id={id} className="auth-field-error" role="alert">
      {message}
    </p>
  );
}

export function SignupView(vm: SignupVm) {
  const errors = vm.fieldErrors;
  return (
    <AuthLayout
      variant="welcome"
      lockScroll
      title="Create your account"
      footerLink={{ hint: "Already have an account?", label: "Log in", to: "/login" }}
    >
      {vm.accountExists ? (
        <div className="auth-exists-panel" role="alert">
          <p className="auth-exists-copy">Account already exists. Please sign in.</p>
          <button type="button" className="auth-simple-submit" onClick={vm.onSignIn}>
            Sign In
          </button>
          <button
            type="button"
            className="auth-simple-secondary"
            style={{ marginTop: 12 }}
            onClick={vm.onDismissExists}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form className="auth-simple-form" onSubmit={vm.onSubmit} noValidate>
          <div className="auth-simple-name-row">
            <div className="auth-simple-field">
              <AuthLabel htmlFor="signup-first">First name</AuthLabel>
              <input
                id="signup-first"
                type="text"
                autoComplete="given-name"
                placeholder="First name"
                value={vm.firstName}
                onChange={(e) => vm.onFirstName(e.target.value)}
                className={inputClass(Boolean(errors.firstName))}
                autoFocus
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? "signup-first-error" : undefined}
              />
              <FieldError id="signup-first-error" message={errors.firstName} />
            </div>
            <div className="auth-simple-field">
              <AuthLabel htmlFor="signup-last">Last name</AuthLabel>
              <input
                id="signup-last"
                type="text"
                autoComplete="family-name"
                placeholder="Last name"
                value={vm.lastName}
                onChange={(e) => vm.onLastName(e.target.value)}
                className={inputClass(Boolean(errors.lastName))}
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? "signup-last-error" : undefined}
              />
              <FieldError id="signup-last-error" message={errors.lastName} />
            </div>
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-email">Work email</AuthLabel>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={vm.email}
              onChange={(e) => vm.onEmail(e.target.value)}
              className={inputClass(Boolean(errors.email))}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
            />
            <FieldError id="signup-email-error" message={errors.email} />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-company">Company</AuthLabel>
            <input
              id="signup-company"
              type="text"
              autoComplete="organization"
              placeholder="Company name"
              value={vm.company}
              onChange={(e) => vm.onCompany(e.target.value)}
              className={inputClass(Boolean(errors.company))}
              aria-invalid={Boolean(errors.company)}
              aria-describedby={errors.company ? "signup-company-error" : undefined}
            />
            <FieldError id="signup-company-error" message={errors.company} />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-password">Password</AuthLabel>
            <PasswordField
              id="signup-password"
              value={vm.password}
              onValueChange={vm.onPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={errors.password ? "auth-simple-input--invalid" : undefined}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "signup-password-error" : undefined}
            />
            <FieldError id="signup-password-error" message={errors.password} />
          </div>

          <div className="auth-simple-field">
            <AuthLabel htmlFor="signup-confirm">Confirm Password</AuthLabel>
            <PasswordField
              id="signup-confirm"
              value={vm.confirmPassword}
              onValueChange={vm.onConfirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter password"
              className={errors.confirmPassword ? "auth-simple-input--invalid" : undefined}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
            />
            <FieldError id="signup-confirm-error" message={errors.confirmPassword} />
          </div>

          <p className="auth-simple-legal">
            By proceeding, you agree to Shelf Merch&apos;s{" "}
            <Link to="/legal/privacy-policy" className="auth-simple-legal-link">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/legal/terms-of-service" className="auth-simple-legal-link">
              Terms of Service
            </Link>
            .
          </p>

          <button type="submit" disabled={vm.busy} className="auth-simple-submit">
            {vm.busy ? "Sending code…" : "Create account"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
