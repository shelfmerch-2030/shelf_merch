/**
 * Keep multipart uploads under reverse-proxy body limits (nginx
 * `client_max_body_size`). Production was 10m; we budget below that so a
 * 13-product collection with print-DPI artwork is sent as several requests
 * instead of one 413.
 */
export const MOCKUP_UPLOAD_BUDGET_BYTES = 6 * 1024 * 1024;

/** Split items into batches whose sizes stay within `budget`. A single item
 * larger than the budget is sent alone (nginx / multer still apply). */
export function chunkBySize<T>(
  items: T[],
  sizeOf: (item: T) => number,
  budget = MOCKUP_UPLOAD_BUDGET_BYTES,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let used = 0;
  const limit = Math.max(1, budget);

  for (const item of items) {
    const size = Math.max(0, sizeOf(item));
    if (current.length && used + size > limit) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += size;
  }
  if (current.length) batches.push(current);
  return batches;
}