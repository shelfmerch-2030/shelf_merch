import { beforeEach, describe, expect, it } from "vitest";
import {
  beginSessionLogout,
  isSessionLogoutStarted,
  resetSessionLogoutState,
} from "./sessionExpired";

describe("session logout latch", () => {
  beforeEach(() => {
    resetSessionLogoutState();
  });

  it("lets only the first failure start logout", () => {
    expect(beginSessionLogout()).toBe(true);
    expect(beginSessionLogout()).toBe(false);
    expect(beginSessionLogout()).toBe(false);
    expect(isSessionLogoutStarted()).toBe(true);
  });
});
