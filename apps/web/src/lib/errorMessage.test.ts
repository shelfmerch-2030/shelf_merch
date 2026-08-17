import { describe, expect, it } from "vitest";
import { formatErrorDetail, formatErrorDetails, messageFromUnknownError } from "./errorMessage";

describe("errorMessage", () => {
  it("formats API validation issue objects into strings", () => {
    expect(formatErrorDetail({ in: "body", path: "name", message: "Required" })).toBe(
      "body.name: Required",
    );
    expect(formatErrorDetail({ in: "body", path: ["items", 0, "sku"], message: "Invalid" })).toBe(
      "body.items.0.sku: Invalid",
    );
  });

  it("formats validation detail arrays without returning raw objects", () => {
    expect(
      formatErrorDetails([
        { in: "body", path: "name", message: "Required" },
        { in: "body", path: ["items", 0, "qty"], message: "Too small" },
      ]),
    ).toEqual(["body.name: Required", "body.items.0.qty: Too small"]);
  });

  it("handles missing or nested details safely", () => {
    expect(formatErrorDetails(undefined)).toEqual([]);
    expect(formatErrorDetail({ error: { details: [{ in: "params", path: "id", message: "Invalid id" }] } })).toBe(
      "params.id: Invalid id",
    );
    expect(messageFromUnknownError({ message: "Upload failed" })).toBe("Upload failed");
  });
});
