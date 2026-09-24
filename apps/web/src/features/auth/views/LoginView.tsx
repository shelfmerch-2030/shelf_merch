import { PasswordField } from "../components/PasswordField";
import type { LoginVm } from "../controllers/useLoginController";
import { AuthLayout, authInputClassName } from "./AuthLayout";

export function LoginView(vm: LoginVm) {
  return (
    <AuthLayout
      variant="welcome"
      title="Welcome back 👋"
      footerLink={{ hint: "Need an account?", label: "Create account", to: "/signup" }}
    >
      <form className="auth-simple-form" onSubmit={vm.onSubmit} aria-busy={vm.busy}>
        <fieldset className="auth-simple-fieldset" disabled={vm.loginDisabled}>
          <div className="auth-float-field">
            <label htmlFor="login-email" className="auth-float-label">
              Work email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={vm.email}
              onChange={(e) => vm.onEmail(e.target.value)}
              className={`${authInputClassName} auth-float-input`}
              autoFocus
            />
          </div>

          <div className="auth-float-field">
            <label htmlFor="login-password" className="auth-float-label">
              Password
            </label>
            <PasswordField
              id="login-password"
              value={vm.password}
              onValueChange={vm.onPassword}
              autoComplete="current-password"
              className="auth-float-input"
            />
          </div>

          <button
            type="button"
            className="auth-simple-label-action auth-forgot-below"
            onClick={vm.onForgotPassword}
          >
            Forgot password?
          </button>

          {vm.error ? (
            <p className="auth-simple-error auth-simple-error--shake" role="alert">
              {vm.error}
            </p>
          ) : null}

          <button type="submit" className="auth-simple-submit" disabled={vm.loginDisabled}>
            {vm.busy ? "Signing in…" : "Log in"}
          </button>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
