type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatPath(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
      .filter(Boolean)
      .join(".");
  }
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

export function formatErrorDetail(detail: unknown): string {
  if (detail instanceof Error) return detail.message || "Request failed";
  if (typeof detail === "string") return detail.trim() || "Request failed";
  if (typeof detail === "number" || typeof detail === "boolean") return String(detail);
  if (Array.isArray(detail)) {
    const list = formatErrorDetails(detail);
    return list.length ? list.join("; ") : "Request failed";
  }
  if (!isRecord(detail)) return "Request failed";

  const nestedDetails = detail.details ?? (isRecord(detail.error) ? detail.error.details : undefined);
  if (nestedDetails !== undefined && nestedDetails !== null) {
    const list = formatErrorDetails(nestedDetails);
    if (list.length) return list.join("; ");
  }

  const message = clean(detail.message);
  const path = formatPath(detail.path);
  const scope = clean(detail.in);
  const field = [scope, path].filter(Boolean).join(".");

  if (field && message) return `${field}: ${message}`;
  if (message) return message;
  if (field) return `${field}: Invalid value`;

  return "Request failed";
}

export function formatErrorDetails(details: unknown): string[] {
  if (details === undefined || details === null) return [];
  const raw = Array.isArray(details) ? details : [details];
  const formatted = raw
    .flatMap((item) => {
      if (Array.isArray(item)) return formatErrorDetails(item);
      return [formatErrorDetail(item)];
    })
    .map((message) => message.trim())
    .filter(Boolean);

  return Array.from(new Set(formatted));
}

export function messageFromUnknownError(error: unknown, fallback = "Request failed"): string {
  if (error instanceof Error) return error.message || fallback;
  const message = formatErrorDetail(error);
  return message === "Request failed" ? fallback : message;
}
