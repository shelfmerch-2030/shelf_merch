import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { startSignup, ApiError } from "../model";

const DRAFT_KEY = "sm_signup_draft";

export type SignupDraft = {
  firstName: string;
  lastName: string;
  company: string;
  password: string;
  email?: string;
};

export function saveSignupDraft(draft: SignupDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readSignupDraft(): SignupDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignupDraft;
  } catch {
    return null;
  }
}

export function clearSignupDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export type SignupFieldErrors = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  password: string;
  confirmPassword: string;
};

const emptyFieldErrors: SignupFieldErrors = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  password: "",
  confirmPassword: "",
};

function personNameError(value: string, label: string) {
  const v = value.trim();
  if (!v) return `Enter your ${label}`;
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(v)) return `Enter a valid ${label}`;
  return "";
}

function workEmailError(value: string) {
  const v = value.trim();
  if (!v) return "Enter your work email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid work email";
  return "";
}

function companyNameError(value: string) {
  const v = value.trim();
  if (!v) return "Enter your company name";
  if (!/\p{L}/u.test(v)) return "Enter a valid company name";
  return "";
}

function passwordFieldError(value: string) {
  if (!value) return "Enter a password";
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Use at least one letter and one number";
  }
  return "";
}

function confirmPasswordError(password: string, confirm: string) {
  if (!confirm) return "Confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return "";
}

export function signupFieldErrors(fields: {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  password: string;
  confirmPassword: string;
}): SignupFieldErrors {
  return {
    firstName: personNameError(fields.firstName, "first name"),
    lastName: personNameError(fields.lastName, "last name"),
    email: workEmailError(fields.email),
    company: companyNameError(fields.company),
    password: passwordFieldError(fields.password),
    confirmPassword: confirmPasswordError(fields.password, fields.confirmPassword),
  };
}

function hasFieldErrors(errors: SignupFieldErrors) {
  return Object.values(errors).some(Boolean);
}

export type SignupVm = {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  company: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  busy: boolean;
  accountExists: boolean;
  fieldErrors: SignupFieldErrors;
  onEmail: (email: string) => void;
  onPassword: (password: string) => void;
  onConfirmPassword: (password: string) => void;
  onFirstName: (firstName: string) => void;
  onLastName: (lastName: string) => void;
  onCompany: (company: string) => void;
  onToggleShowPassword: () => void;
  onToggleShowConfirmPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSignIn: () => void;
  onDismissExists: () => void;
};

/** Controller for the signup screen: form state → OTP start (no user create yet). */
export function useSignupController(): SignupVm {
  const submitInFlight = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { draft?: SignupDraft } | null)?.draft;
  const query = new URLSearchParams(location.search);
  const queryEmail = query.get("email")?.trim() ?? "";
  const queryFirst = query.get("firstName")?.trim() ?? "";
  const queryLast = query.get("lastName")?.trim() ?? "";
  const queryCompany = query.get("company")?.trim() ?? "";

  const [email, setEmail] = useState(
    () => prefill?.email || queryEmail || readSignupDraft()?.email || "",
  );
  const [password, setPassword] = useState(() => prefill?.password ?? readSignupDraft()?.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState(() => prefill?.password ?? readSignupDraft()?.password ?? "");
  const [firstName, setFirstName] = useState(
    () => prefill?.firstName || queryFirst || readSignupDraft()?.firstName || "",
  );
  const [lastName, setLastName] = useState(
    () => prefill?.lastName || queryLast || readSignupDraft()?.lastName || "",
  );
  const [company, setCompany] = useState(
    () => prefill?.company || queryCompany || readSignupDraft()?.company || "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>(emptyFieldErrors);

  function fieldsNow(patch: Partial<SignupFieldErrors> = {}) {
    return {
      firstName,
      lastName,
      email,
      company,
      password,
      confirmPassword,
      ...patch,
    };
  }

  function refreshErrors(patch: Partial<SignupFieldErrors> = {}) {
    if (!submitted) return;
    setFieldErrors(signupFieldErrors(fieldsNow(patch)));
  }

  useEffect(() => {
    if (prefill) {
      // Clear one-shot navigation state.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;

    const trimmedEmail = email.trim();
    const errors = signupFieldErrors({
      firstName,
      lastName,
      email: trimmedEmail,
      company,
      password,
      confirmPassword,
    });
    setSubmitted(true);
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();

    submitInFlight.current = true;
    setBusy(true);
    setAccountExists(false);
    const draft: SignupDraft = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: company.trim(),
      password,
      email: trimmedEmail,
    };
    saveSignupDraft(draft);

    try {
      const result = await startSignup({
        name,
        email: trimmedEmail,
        password,
        companyName: company.trim(),
      });
      navigate("/signup/verify", {
        replace: false,
        state: {
          pendingId: result.pendingId,
          email: result.email,
          emailMasked: result.emailMasked,
          otpExpiresInSec: result.otpExpiresInSec,
          resendAvailableInSec: result.resendAvailableInSec,
          draft,
        },
      });
    } catch (err) {
      submitInFlight.current = false;
      setBusy(false);
      if (err instanceof ApiError && (err.code === "EMAIL_EXISTS" || err.status === 409)) {
        setAccountExists(true);
        toast.error("Account already exists. Please sign in.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    }
  }

  return {
    email,
    password,
    confirmPassword,
    firstName,
    lastName,
    company,
    showPassword,
    showConfirmPassword,
    busy,
    accountExists,
    fieldErrors,
    onEmail: (v) => {
      setAccountExists(false);
      setEmail(v);
      refreshErrors({ email: v });
    },
    onPassword: (v) => {
      setPassword(v);
      refreshErrors({ password: v });
    },
    onConfirmPassword: (v) => {
      setConfirmPassword(v);
      refreshErrors({ confirmPassword: v });
    },
    onFirstName: (v) => {
      setFirstName(v);
      refreshErrors({ firstName: v });
    },
    onLastName: (v) => {
      setLastName(v);
      refreshErrors({ lastName: v });
    },
    onCompany: (v) => {
      setCompany(v);
      refreshErrors({ company: v });
    },
    onToggleShowPassword: () => setShowPassword((s) => !s),
    onToggleShowConfirmPassword: () => setShowConfirmPassword((s) => !s),
    onSubmit: submit,
    onSignIn: () => navigate("/login"),
    onDismissExists: () => setAccountExists(false),
  };
}
