import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { login, isPlatformUser, ApiError } from "../model";

export type LoginVm = {
  email: string;
  password: string;
  showPassword: boolean;
  busy: boolean;
  error: string;
  loginDisabled: boolean;
  onEmail: (email: string) => void;
  onPassword: (password: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
};

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return "Too many login attempts — wait a moment and try again.";
    }
    if (err.status === 502 || err.status === 503) {
      return "Cannot reach the server. Start the API with npm run dev:api.";
    }
    if (
      err.code === "TENANT_ARCHIVED" ||
      err.code === "TENANT_SUSPENDED" ||
      err.code === "ACCOUNT_SUSPENDED"
    ) {
      return (
        err.message ||
        "Your organization account has been suspended. Please contact Shelf Merch support."
      );
    }
    if (err.code === "NO_ACCOUNT") {
      return "No account exists with this email. Sign up to create one.";
    }
    if (err.code === "INVALID_CREDENTIALS") {
      return "Incorrect password.";
    }
    if (err.status === 401) {
      return err.message || "Incorrect password.";
    }
    return err.message;
  }
  if (err instanceof TypeError) {
    return "Cannot reach the server. Start the API with npm run dev:api.";
  }
  return err instanceof Error ? err.message : "Login failed";
}

/** Controller for the login screen: form state, submit flow, redirect by role. */
export function useLoginController(): LoginVm {
  const navigate = useNavigate();
  const submitInFlight = useRef(false);
  const [email, setEmail] = useState("hr@rubix.net");
  const [password, setPassword] = useState("demo1234");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error("Enter email and password");
      return;
    }

    submitInFlight.current = true;
    setError("");
    setBusy(true);
    try {
      const user = await login(trimmedEmail, password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);
      const destination = isPlatformUser(user) ? "/platform/dashboard" : "/app";
      window.location.assign(destination);
    } catch (err) {
      submitInFlight.current = false;
      setBusy(false);
      const message = loginErrorMessage(err);
      setError(message);
      toast.error(message);
    }
  }

  return {
    email,
    password,
    showPassword,
    busy,
    error,
    loginDisabled: busy,
    onEmail: setEmail,
    onPassword: setPassword,
    onToggleShowPassword: () => setShowPassword((s) => !s),
    onSubmit: submit,
    onForgotPassword: () => navigate("/forgot-password"),
  };
}
