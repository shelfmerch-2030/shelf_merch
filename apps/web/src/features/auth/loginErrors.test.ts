import { describe, it, expect } from "vitest";
import { loginErrorMessage } from "@/features/auth/loginErrors";
import { ApiError } from "@/services/api";

describe("loginErrorMessage", () => {
  it("maps NO_ACCOUNT and invalid credentials", () => {
    expect(loginErrorMessage(new ApiError(401, "missing", "NO_ACCOUNT"))).toMatch(/sign up/i);
    expect(loginErrorMessage(new ApiError(401, "bad", "INVALID_CREDENTIALS"))).toBe(
      "Incorrect password.",
    );
  });

  it("maps suspended tenant / account codes", () => {
    expect(
      loginErrorMessage(new ApiError(403, "Workspace suspended", "TENANT_SUSPENDED")),
    ).toBe("Workspace suspended");
    expect(loginErrorMessage(new ApiError(403, "", "ACCOUNT_SUSPENDED"))).toMatch(/suspended/i);
  });

  it("maps rate limit and unreachable server cases", () => {
    expect(loginErrorMessage(new ApiError(429, "slow down"))).toMatch(/too many login attempts/i);
    expect(loginErrorMessage(new ApiError(503, "down"))).toMatch(/cannot reach the server/i);
    expect(loginErrorMessage(new TypeError("Failed to fetch"))).toMatch(/cannot reach the server/i);
  });

  it("falls back for unknown errors", () => {
    expect(loginErrorMessage(new Error("boom"))).toBe("boom");
    expect(loginErrorMessage("x")).toBe("Login failed");
  });
});
