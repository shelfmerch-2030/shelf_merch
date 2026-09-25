import { describe, expect, it, beforeEach } from "vitest";
import {
  isSessionExpiredModalOpen,
  openSessionExpiredModal,
  resetSessionExpiredState,
  subscribeSessionExpired,
} from "./sessionExpired";

describe("session expired modal state", () => {
  beforeEach(() => {
    resetSessionExpiredState();
  });

  it("opens once when several requests fail together", () => {
    const seen: boolean[] = [];
    subscribeSessionExpired((open) => seen.push(open));

    openSessionExpiredModal();
    openSessionExpiredModal();
    openSessionExpiredModal();

    expect(isSessionExpiredModalOpen()).toBe(true);
    expect(seen.filter(Boolean)).toEqual([true]);
  });
});
