import type { ReactNode } from "react";
import { DocsHeading, DocsShell } from "../DocsShell";
import { useDocsMeta } from "../useDocsMeta";
import "./api-docs.css";

const NAV = [
  { to: "#overview", label: "Overview" },
  { to: "#authentication", label: "Authentication" },
  { to: "#test-mode", label: "Test mode" },
  { to: "#idempotency", label: "Idempotency" },
  { to: "#errors", label: "Errors" },
  { to: "#rate-limits", label: "Rate limits" },
  { to: "#products", label: "Products & SKUs" },
  { to: "#sku-mappings", label: "SKU mappings" },
  { to: "#create-order", label: "Create an order" },
  { to: "#read-orders", label: "Read orders" },
  { to: "#update-cancel", label: "Update & cancel" },
  { to: "#statuses", label: "Order statuses" },
  { to: "#webhooks", label: "Webhooks" },
  { to: "#verify", label: "Verify signatures" },
  { to: "#simulate", label: "Sandbox simulate" },
  { to: "#versioning", label: "Versioning" },
] as const;

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <pre className="api-code" data-lang={lang}>
      <code>{children.trim()}</code>
    </pre>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <p className="api-endpoint">
      <span className={`api-method api-method--${method.toLowerCase()}`}>{method}</span>
      <code>/api/public/v1{path}</code>
    </p>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="api-table-wrap">
      <table className="api-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BASE = typeof window !== "undefined" ? `${window.location.origin}/api/public/v1` : "https://shelfmerch.io/api/public/v1";

/** Public reference for the ShelfMerch Orders API (v1). */
export function ApiDocsPage() {
  useDocsMeta({
    title: "ShelfMerch Orders API · Documentation",
    description: "Send orders to ShelfMerch for printing and shipping, and receive status webhooks.",
    canonicalPath: "/docs/api",
  });

  return (
    <DocsShell className="api-docs" activePath="/docs/api" nav={NAV} navTitle="Orders API" breadcrumbs={[{ label: "Home", to: "/" }, { label: "Orders API" }]}>
      <h1>ShelfMerch Orders API</h1>
      <p className="api-lead">
        Send your customers' orders to ShelfMerch from your store, ERP or checkout. We print, pack and ship them, and
        tell you when they move through production with signed webhooks.
      </p>

      <DocsHeading id="overview">Overview</DocsHeading>
      <ul>
        <li>Base URL: <code>{BASE}</code></li>
        <li>JSON in, JSON out. Field names are <code>snake_case</code>; times are ISO 8601 UTC; money is INR.</li>
        <li>Machine-readable spec: <a href={`${BASE}/openapi.json`}>openapi.json</a> (import into Postman, Insomnia or an SDK generator).</li>
        <li>Typical flow: <b>create an order</b> → receive <code>order.received</code> → <code>order.in_production</code> → <code>order.shipped</code> (with tracking) → <code>order.delivered</code>.</li>
      </ul>

      <DocsHeading id="authentication">Authentication</DocsHeading>
      <p>
        A company admin creates API keys in <b>Settings → Developers</b>. Send the key as a bearer token on every request.
        Keys are shown once; keep them on your server (never in a browser or mobile app). Revoke a leaked key immediately
        from the same screen.
      </p>
      <Code lang="bash">{`curl ${BASE}/orders \\
  -H "Authorization: Bearer smk_live_…"`}</Code>
      <p>Each key has scopes: <code>orders:write</code> (create, update, cancel), <code>orders:read</code>, <code>products:read</code>.</p>

      <DocsHeading id="test-mode">Test mode</DocsHeading>
      <p>
        Keys starting <code>smk_test_</code> create <b>sandbox orders</b>: fully validated and stored, visible only to test
        keys, but never printed, shipped or billed. Webhook endpoints are also test or live, and only receive events for
        orders of the same mode. Build against a test key, then swap in a live key.
      </p>

      <DocsHeading id="idempotency">Idempotency</DocsHeading>
      <p>
        <code>POST /orders</code> requires an <code>Idempotency-Key</code> header (a UUID per logical order is ideal). If a
        request times out, retry with the <b>same key</b>: you get the original response (with
        <code>Idempotent-Replay: true</code>) instead of a duplicate order. Keys are remembered for 24 hours. Independently,
        <code>external_id</code> is unique: a second order with the same <code>external_id</code> returns
        <code>409 order_exists</code> with the existing order id.
      </p>
      <Code lang="bash">{`curl -X POST ${BASE}/orders \\
  -H "Authorization: Bearer smk_test_…" \\
  -H "Idempotency-Key: 7c9f6a1e-2b1d-4d2e-9f00-1a2b3c4d5e6f" \\
  -H "Content-Type: application/json" \\
  -d @order.json`}</Code>

      <DocsHeading id="errors">Errors</DocsHeading>
      <p>Errors use HTTP status codes and one envelope. <code>code</code> is stable — branch on it, not on <code>message</code>.</p>
      <Code lang="json">{`{
  "error": {
    "type": "invalid_request_error",
    "code": "validation_failed",
    "message": "2 problems with this order",
    "param": "items[0].sku",
    "details": [
      { "param": "items[0].sku", "code": "unknown_sku", "message": "SKU TEE-RED is not mapped to a ShelfMerch product" },
      { "param": "shipping_address.pincode", "code": "invalid_pincode", "message": "Indian pincodes have 6 digits" }
    ],
    "request_id": "c0a8012e-…"
  }
}`}</Code>
      <Table
        head={["Status", "type", "Common codes", "What to do"]}
        rows={[
          ["400", "invalid_request_error", <code>validation_failed, idempotency_key_required, invalid_json</code>, "Fix the request"],
          ["401", "authentication_error", <code>api_key_missing, api_key_invalid, api_key_revoked</code>, "Check the key"],
          ["403", "permission_error", <code>insufficient_scope, test_mode_only</code>, "Use a key with the scope / a test key"],
          ["404", "not_found_error", <code>resource_missing</code>, "Wrong id, or the order belongs to the other mode"],
          ["409", "conflict_error", <code>order_exists, order_locked, order_not_cancellable</code>, "Read the order and reconcile"],
          ["422", "invalid_request_error", <code>validation_failed</code>, "See details[] — unknown_sku, variant_unavailable, invalid_pincode, invalid_phone"],
          ["429", "rate_limit_error", <code>rate_limited</code>, "Wait Retry-After seconds"],
          ["5xx", "api_error", <code>internal_error</code>, "Retry with the same Idempotency-Key"],
        ]}
      />
      <p>Every response has an <code>X-Request-Id</code> header — include it when contacting support.</p>

      <DocsHeading id="rate-limits">Rate limits</DocsHeading>
      <p>
        120 requests per minute per key. Responses carry <code>X-RateLimit-Remaining</code>; a <code>429</code> carries
        <code>Retry-After</code> (seconds). Use webhooks instead of polling for status.
      </p>

      <DocsHeading id="products">Products & SKUs</DocsHeading>
      <p>Each line's <code>sku</code> can be any of these, checked in order:</p>
      <ol>
        <li><b>Your own SKU</b>, mapped to a ShelfMerch product with the <a href="#sku-mappings">SKU mappings API</a> or in Settings → Developers.</li>
        <li><b>A branded listing id</b> (<code>collectionId:productId</code>) — a product you designed in ShelfMerch; your artwork and print placement come with it.</li>
        <li><b>A ShelfMerch catalog SKU or variant SKU</b> — a blank; send <code>artwork_url</code> for what to print.</li>
      </ol>
      <p>
        <code>size</code> and <code>color</code> pick the variant (<code>2XL</code> and <code>XXL</code> are the same).
        <code>GET /products</code> lists your listings and mapped SKUs with their variants; <code>?type=catalog</code> pages the full catalog.
      </p>
      <Endpoint method="GET" path="/products" />

      <DocsHeading id="sku-mappings">SKU mappings</DocsHeading>
      <p>
        Keep your own SKUs and tell us once which ShelfMerch product each one is. After that, send your SKU in{" "}
        <code>items[].sku</code>. Sync from your system whenever products change — writes are safe to repeat. Needs the{" "}
        <code>sku_mappings:write</code> scope (<code>sku_mappings:read</code> to list).
      </p>
      <p>
        <code>catalog_sku</code> is a ShelfMerch product SKU or variant SKU from <code>GET /products?type=catalog</code>.
        A variant SKU fixes the size and colour; with a product SKU you can fix them with <code>size</code> /{" "}
        <code>color</code>, or leave them out to take them from each order line. Mappings belong to your workspace and are
        shared by test and live keys.
      </p>
      <Endpoint method="PUT" path="/sku-mappings/{sku}" />
      <Code lang="json">{`// PUT /sku-mappings/ACME-TEE-NAVY-L   (URL-encode SKUs containing / or spaces)
{ "catalog_sku": "APRN-1007-NAV-L", "artwork_url": "https://cdn.example.com/logo.png" }

// 201 Created (200 if it already existed — PUT replaces the whole mapping)
{
  "object": "sku_mapping",
  "sku": "ACME-TEE-NAVY-L",
  "catalog_sku": "APRN-1007",
  "product_name": "Sustainable Crew Neck T-Shirt",
  "variant": { "size": "L", "color": "Midnight Navy" },
  "artwork_url": "https://cdn.example.com/logo.png",
  "created_at": "2026-11-25T10:00:00.000Z",
  "updated_at": "2026-11-25T10:00:00.000Z"
}`}</Code>
      <Endpoint method="POST" path="/sku-mappings/bulk" />
      <p>
        Up to 1,000 rows (1 MB) per request. Each row succeeds or fails on its own, so always check{" "}
        <code>summary.failed</code> and each row's <code>error</code>.
      </p>
      <Code lang="json">{`{ "mappings": [
  { "sku": "ACME-MUG", "catalog_sku": "MUG-11OZ" },
  { "sku": "ACME-POLO", "catalog_sku": "SM-POLO-001", "color": "Maroon" },
  { "sku": "ACME-CAP", "catalog_sku": "NOPE" }
] }

// 200
{
  "object": "sku_mapping_bulk_result",
  "summary": { "created": 1, "updated": 0, "unchanged": 1, "failed": 1 },
  "data": [
    { "index": 0, "sku": "ACME-MUG", "result": "created", "mapping": { ... } },
    { "index": 1, "sku": "ACME-POLO", "result": "unchanged", "mapping": { ... } },
    { "index": 2, "sku": "ACME-CAP", "result": "failed",
      "error": { "code": "catalog_sku_not_found", "param": "catalog_sku", "message": "..." } }
  ]
}`}</Code>
      <Table
        head={["Row error code", "Meaning"]}
        rows={[
          [<code>catalog_sku_not_found</code>, "No active ShelfMerch product or variant has that SKU"],
          [<code>variant_not_found</code>, "The product isn't offered in that size / colour"],
          [<code>variant_conflict</code>, "A variant SKU was sent with a different size / colour"],
          [<code>duplicate_sku</code>, "The same sku appears twice in the batch (both rows are rejected)"],
          [<code>invalid_row</code>, "Missing or malformed field — see param"],
        ]}
      />
      <Endpoint method="GET" path="/sku-mappings?limit=50&starting_after={next_cursor}" />
      <Endpoint method="GET" path="/sku-mappings/{sku}" />
      <Endpoint method="DELETE" path="/sku-mappings/{sku}" />

      <DocsHeading id="create-order">Create an order</DocsHeading>
      <Endpoint method="POST" path="/orders" />
      <Code lang="json">{`{
  "external_id": "WEB-10042",
  "customer": { "name": "Asha Rao", "email": "asha@example.com", "phone": "9876543210" },
  "shipping_address": {
    "name": "Asha Rao",
    "phone": "9876543210",
    "line1": "12 MG Road",
    "line2": "Flat 4B",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560001",
    "country": "IN"
  },
  "items": [
    { "sku": "TEE-CLASSIC", "quantity": 2, "size": "L", "color": "Black" },
    { "sku": "SM-MUG-001", "quantity": 1, "artwork_url": "https://cdn.example.com/logo.png" }
  ],
  "notes": "Gift wrap",
  "metadata": { "cart_id": "c_981" }
}`}</Code>
      <Table
        head={["Field", "Required", "Notes"]}
        rows={[
          [<code>external_id</code>, "yes", "Your order id; unique per mode (≤100 chars)"],
          [<code>shipping_address</code>, "yes", "name, phone (≥10 digits), line1, city, state, pincode (6 digits in India); line2 and country optional"],
          [<code>items[]</code>, "yes", "1–100 lines: sku, quantity, optional size, color, artwork_url (https)"],
          [<code>customer</code>, "no", "Defaults to the shipping name/phone"],
          [<code>notes</code>, "no", "≤1000 chars, shown to production"],
          [<code>metadata</code>, "no", "Up to 20 key/values, echoed back on reads and webhooks"],
        ]}
      />
      <p>Returns <code>201</code> with the order:</p>
      <Code lang="json">{`{
  "object": "order",
  "id": "6750c1f2a7c4e2b1d0a9f311",
  "number": "SM-2026-000123",
  "external_id": "WEB-10042",
  "status": "received",
  "test": false,
  "items": [{ "sku": "SM-TEE-CL-BLK-L", "name": "Classic Tee", "quantity": 2, "size": "L", "color": "Black", "unit_price": 450 }],
  "amounts": { "currency": "INR", "subtotal": 1350, "shipping": 0, "tax": 0, "total": 1350 },
  "tracking": null,
  "metadata": { "cart_id": "c_981" },
  "created_at": "2026-11-24T09:30:00.000Z",
  "updated_at": "2026-11-24T09:30:00.000Z"
}`}</Code>

      <DocsHeading id="read-orders">Read orders</DocsHeading>
      <Endpoint method="GET" path="/orders/{id}" />
      <p><code>{"{id}"}</code> is the order <code>id</code> or <code>number</code>.</p>
      <Endpoint method="GET" path="/orders?status=shipped&limit=20" />
      <p>
        Newest first. Filters: <code>status</code>, <code>external_id</code>, <code>updated_since</code>. Pass
        <code>next_cursor</code> from a page as <code>starting_after</code> to get the next one while
        <code>has_more</code> is true.
      </p>

      <DocsHeading id="update-cancel">Update & cancel</DocsHeading>
      <p>While an order is <code>received</code> (before production starts) you can change it or cancel it. After that, both return <code>409</code> — contact support.</p>
      <Endpoint method="PATCH" path="/orders/{id}" />
      <Code lang="json">{`{ "shipping_address": { "line1": "99 Residency Road" }, "notes": "Call before delivery" }`}</Code>
      <Endpoint method="POST" path="/orders/{id}/cancel" />
      <Code lang="json">{`{ "reason": "Customer cancelled" }`}</Code>

      <DocsHeading id="statuses">Order statuses</DocsHeading>
      <Table
        head={["status", "Meaning", "Webhook"]}
        rows={[
          [<code>received</code>, "Accepted; can still be changed or cancelled", <code>order.received</code>],
          [<code>in_production</code>, "Being printed, checked and packed", <code>order.in_production</code>],
          [<code>shipped</code>, "With the courier; tracking is set", <code>order.shipped</code>],
          [<code>delivered</code>, "Delivered", <code>order.delivered</code>],
          [<code>on_hold</code>, "Paused for an issue — ShelfMerch will contact you", <code>order.on_hold</code>],
          [<code>cancelled</code>, "Cancelled", <code>order.cancelled</code>],
        ]}
      />
      <p>New statuses may be added in v1; treat unknown values as "in progress".</p>

      <DocsHeading id="webhooks">Webhooks</DocsHeading>
      <p>
        Add an endpoint in <b>Settings → Developers → Webhooks</b>. We <code>POST</code> an event when an order's status
        changes (and <code>order.updated</code> when you PATCH it):
      </p>
      <Code lang="http">{`POST /webhooks/shelfmerch HTTP/1.1
Content-Type: application/json
ShelfMerch-Event-Id: evt_3f9a…
ShelfMerch-Event-Type: order.shipped
ShelfMerch-Signature: t=1764063000,v1=5b2c…

{
  "id": "evt_3f9a…",
  "object": "event",
  "type": "order.shipped",
  "livemode": true,
  "created_at": "2026-11-26T10:30:00.000Z",
  "data": { "object": { "object": "order", "id": "6750…", "status": "shipped",
    "tracking": { "courier": "Delhivery", "awb": "1234567890", "url": "https://…" }, "…": "…" } }
}`}</Code>
      <ul>
        <li>Respond with any <b>2xx within 10 seconds</b>; do slow work after responding.</li>
        <li>Failures are retried after 1m, 5m, 30m, 2h, 5h, then every 10h — about 3 days. An endpoint failing for 3 days is disabled and your admins are emailed.</li>
        <li>Delivery is <b>at least once</b> and <b>not ordered</b>: dedupe by <code>ShelfMerch-Event-Id</code>, and use <code>data.object.status</code> / <code>updated_at</code> as the truth.</li>
        <li>Use <b>Send test</b> and the <b>Deliveries</b> log (with Resend) in Settings to debug.</li>
      </ul>

      <DocsHeading id="verify">Verify signatures</DocsHeading>
      <p>
        Compute <code>HMAC-SHA256(secret, "&lt;t&gt;.&lt;raw body&gt;")</code> with your endpoint's signing secret
        (<code>whsec_…</code>) and compare it to <code>v1</code>. Use the <b>raw</b> request body, not re-serialized JSON,
        and reject timestamps older than 5 minutes.
      </p>
      <Code lang="javascript">{`// Node.js (Express)
import crypto from "node:crypto";

app.post("/webhooks/shelfmerch", express.raw({ type: "application/json" }), (req, res) => {
  const { t, v1 } = Object.fromEntries(req.get("ShelfMerch-Signature").split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", process.env.SHELFMERCH_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`).digest("hex");
  const valid = v1 && expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) &&
    Math.abs(Date.now() / 1000 - Number(t)) < 300;
  if (!valid) return res.sendStatus(400);

  const event = JSON.parse(req.body);
  // dedupe on event.id, then handle event.type …
  res.sendStatus(200);
});`}</Code>
      <Code lang="python">{`# Python (Flask)
import hmac, hashlib, time, os
from flask import request, abort

@app.post("/webhooks/shelfmerch")
def shelfmerch_webhook():
    parts = dict(p.split("=", 1) for p in request.headers["ShelfMerch-Signature"].split(","))
    body = request.get_data()  # raw bytes
    expected = hmac.new(os.environ["SHELFMERCH_WEBHOOK_SECRET"].encode(),
                        f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")) or abs(time.time() - int(parts["t"])) > 300:
        abort(400)
    event = request.get_json()
    return "", 200`}</Code>

      <DocsHeading id="simulate">Sandbox simulate</DocsHeading>
      <Endpoint method="POST" path="/orders/{id}/simulate" />
      <p>
        Test keys only. Moves a test order to <code>in_production</code>, <code>shipped</code> (with a test AWB) or
        <code>delivered</code>, firing the same webhooks a real order would.
      </p>
      <Code lang="json">{`{ "status": "shipped" }`}</Code>

      <DocsHeading id="versioning">Versioning</DocsHeading>
      <p>
        This is v1 (<code>/api/public/v1</code>, header <code>ShelfMerch-Api-Version: 1</code>). Within v1 we only make
        additive changes — new fields, endpoints, event types or status values. Breaking changes ship as v2 with notice.
      </p>
    </DocsShell>
  );
}
