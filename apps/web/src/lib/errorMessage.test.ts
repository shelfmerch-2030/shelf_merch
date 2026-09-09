import { describe, expect, it } from "vitest";
import { formatErrorDetail, formatErrorDetails, messageFromUnknownError, messageFromGatewayResponse, PAYLOAD_TOO_LARGE_MESSAGE } from "./errorMessage";

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

describe("messageFromGatewayResponse", () => {
  it("maps nginx 413 HTML to an actionable message", () => {
    const html =
      "<html>\r\n<head><title>413 Request Entity Too Large</title></head>\r\n<body>\r\n<center><h1>413 Request Entity Too Large</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\r\n";
    expect(messageFromGatewayResponse(413, html)).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
    expect(messageFromGatewayResponse(413, "")).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
  });

  it("does not dump raw HTML for other proxy error pages", () => {
    expect(messageFromGatewayResponse(500, "<html><h1>Internal Server Error</h1></html>")).toBe(
      "The server rejected this request. Please try again.",
    );
    expect(messageFromGatewayResponse(400, { error: { message: "Invalid" } })).toBeNull();
  });
});
