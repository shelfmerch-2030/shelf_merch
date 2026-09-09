import { describe, expect, it } from "vitest";
import { PAYLOAD_TOO_LARGE_MESSAGE } from "@/lib/errorMessage";
import { ApiError, errorFromResponse } from "./api";

const NGINX_413 = `<html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>
</body>
</html>`;

describe("errorFromResponse", () => {
  it("maps nginx 413 HTML to a user-facing message instead of raw HTML", () => {
    const err = errorFromResponse(413, NGINX_413);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.code).toBe("PAYLOAD_TOO_LARGE");
    expect(err.message).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
    expect(err.message).not.toContain("<html>");
    expect(err.message).not.toContain("nginx");
  });

  it("maps a 413 with an empty body", () => {
    expect(errorFromResponse(413, null).message).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
  });

  it("keeps JSON API error messages", () => {
    const err = errorFromResponse(413, {
      error: { code: "LIMIT_FILE_SIZE", message: "Uploaded file is too large" },
    });
    expect(err.message).toBe("Uploaded file is too large");
    expect(err.code).toBe("LIMIT_FILE_SIZE");
  });

  it("does not dump non-JSON HTML for other gateway failures", () => {
    const err = errorFromResponse(500, "<html><h1>Internal Server Error</h1></html>");
    expect(err.message).toBe("The server rejected this request. Please try again.");
    expect(err.message).not.toContain("<html>");
  });
});