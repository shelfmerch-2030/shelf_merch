import { ApiError } from "@/services/api";

/** Map login API failures to user-facing copy (shared by controller + tests). */
export function loginErrorMessage(err: unknown): string {
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
