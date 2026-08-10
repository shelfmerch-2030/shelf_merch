import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { login, isPlatformUser } from "../model";
import { loginErrorMessage } from "../loginErrors";

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
