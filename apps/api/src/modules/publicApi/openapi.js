import { PUBLIC_ORDER_STATUSES } from '../orders/publicStatus.js';
import { WEBHOOK_EVENT_TYPES } from '../webhooks/webhooks.constants.js';

/**
 * OpenAPI 3.1 description of the public API — the machine-readable contract.
 * Served at GET /api/public/v1/openapi.json (no auth). Keep in step with
 * publicApi.routes.js; tests assert every route here exists.
 */
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const errorResponses = (...codes) =>
  Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));

const Address = {
  type: 'object',
  required: ['name', 'phone', 'line1', 'city', 'state', 'pincode'],
  properties: {
    name: { type: 'string', maxLength: 120 },
    phone: { type: 'string', maxLength: 20, description: 'At least 10 digits; couriers call this number.' },
    line1: { type: 'string', maxLength: 200 },
    line2: { type: 'string', maxLength: 200 },
    city: { type: 'string', maxLength: 80 },
    state: { type: 'string', maxLength: 80 },
    pincode: { type: 'string', description: '6 digits for India.' },
    country: { type: 'string', default: 'IN', description: 'ISO-2 code; "India" is accepted.' },
  },
};

const Customer = {
  type: 'object',
  properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' } },
};

export function buildOpenApi(serverUrl) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ShelfMerch Orders API',
      version: '1.0.0',
      description:
        'Send orders to ShelfMerch for production and shipping, and track them. ' +
        'Authenticate with `Authorization: Bearer <API key>`. Test keys (`smk_test_…`) create sandbox orders that are never produced.',
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    tags: [
      { name: 'Orders' },
      { name: 'Products' },
      { name: 'SKU mappings', description: 'Map your own SKUs to ShelfMerch products, then send your SKUs in `items[].sku`. Mappings belong to the workspace and are shared by test and live keys.' },
      { name: 'Catalog', description: 'Import the ShelfMerch catalog into your platform and keep it in sync. Order imported products by `variant_id` (or `product_id` + size/color) — no SKUs of your own needed.' },
    ],
    paths: {
      '/catalog/products': {
        get: {
          tags: ['Catalog'],
          summary: 'List catalog products',
          description:
            'Ordered by `updated_at`, then id, so paging is stable. For incremental sync pass `updated_since` (your last `sync_checkpoint`); ' +
            'the response then also includes products discontinued since then (`status: "discontinued"`). Requires `catalog:read`.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250, default: 100 } },
            { name: 'cursor', in: 'query', description: 'The `next_cursor` of the previous page.', schema: { type: 'string' } },
            { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'status', in: 'query', description: 'Default `active`; `all` when `updated_since` is set.', schema: { type: 'string', enum: ['active', 'discontinued', 'all'] } },
            { name: 'category', in: 'query', description: 'Category name, label or id.', schema: { type: 'string' } },
            { name: 'ids', in: 'query', description: 'Up to 100 comma-separated product ids.', schema: { type: 'string' } },
            { name: 'imported', in: 'query', description: '`true`: only products you imported.', schema: { type: 'string', enum: ['true', 'false'] } },
          ],
          responses: {
            200: { description: 'Products', content: { 'application/json': { schema: { type: 'object', properties: { object: { const: 'list' }, data: { type: 'array', items: ref('CatalogProduct') }, has_more: { type: 'boolean' }, next_cursor: { type: ['string', 'null'] }, sync_checkpoint: { type: ['string', 'null'], format: 'date-time' } } } } } },
            ...errorResponses(400, 401, 403, 429),
          },
        },
      },
      '/catalog/products/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Product id or product SKU.', schema: { type: 'string' } }],
        get: { tags: ['Catalog'], summary: 'Retrieve a catalog product', responses: { 200: { description: 'Product', content: { 'application/json': { schema: ref('CatalogProduct') } } }, ...errorResponses(401, 403, 404) } },
      },
      '/catalog/categories': {
        get: { tags: ['Catalog'], summary: 'List categories', responses: { 200: { description: 'Flat category tree (parent_id links)', content: { 'application/json': { schema: { type: 'object' } } } }, ...errorResponses(401, 403) } },
      },
      '/catalog/imports': {
        post: {
          tags: ['Catalog'],
          summary: 'Import products',
          description:
            'Record which products you carry: `{"all": true}` (optionally with `category`) or `{"product_ids": [...]}` (up to 1,000). ' +
            'Re-importing never duplicates: unchanged products are `skipped`, changed ones `updated`. Imported products get catalog webhooks. Requires `catalog:import`.',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKeyOptional' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { all: { const: true }, product_ids: { type: 'array', maxItems: 1000, items: { type: 'string' } }, category: { type: 'string' } } } } } },
          responses: { 201: { description: 'Completed import with summary', content: { 'application/json': { schema: ref('CatalogImport') } } }, ...errorResponses(400, 401, 403, 429) },
        },
        get: {
          tags: ['Catalog'],
          summary: 'List recent imports',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }],
          responses: { 200: { description: 'Imports', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: ref('CatalogImport') } } } } } }, ...errorResponses(401, 403) },
        },
      },
      '/catalog/imports/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: { tags: ['Catalog'], summary: 'Retrieve an import', responses: { 200: { description: 'Import', content: { 'application/json': { schema: ref('CatalogImport') } } }, ...errorResponses(401, 403, 404) } },
      },
      '/catalog/imports/{id}/items': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          tags: ['Catalog'],
          summary: 'Per-product results of an import',
          parameters: [
            { name: 'result', in: 'query', description: 'Comma list of imported, updated, skipped, failed.', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
            { name: 'starting_after', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Results with `reason` for skipped/failed (`unchanged_since_last_import`, `product_not_found`, `product_discontinued`)', content: { 'application/json': { schema: { type: 'object' } } } }, ...errorResponses(401, 403, 404) },
        },
      },
      '/catalog/imported': {
        get: {
          tags: ['Catalog'],
          summary: 'List products you imported',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
            { name: 'starting_after', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Imported product ids', content: { 'application/json': { schema: { type: 'object' } } } }, ...errorResponses(401, 403) },
        },
      },
      '/catalog/imported/{product_id}': {
        parameters: [{ name: 'product_id', in: 'path', required: true, schema: { type: 'string' } }],
        delete: { tags: ['Catalog'], summary: 'Stop syncing a product (no more catalog webhooks for it)', responses: { 200: { description: 'Removed' }, ...errorResponses(401, 403, 404) } },
      },
      '/products': {
        get: {
          tags: ['Products'],
          summary: 'List products you can order',
          description: 'Branded listings (your designs, artwork included), your mapped SKUs, or the plain catalog (`type=catalog`).',
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['listing', 'mapped', 'catalog'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: {
            200: { description: 'Products', content: { 'application/json': { schema: { type: 'object', properties: { object: { const: 'list' }, data: { type: 'array', items: ref('Product') }, has_more: { type: 'boolean' } } } } } },
            ...errorResponses(401, 403, 429),
          },
        },
      },
      '/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Create an order',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
          requestBody: { required: true, content: { 'application/json': { schema: ref('CreateOrder') } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: ref('Order') } } },
            ...errorResponses(400, 401, 403, 409, 422, 429),
          },
        },
        get: {
          tags: ['Orders'],
          summary: 'List orders (newest first)',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: PUBLIC_ORDER_STATUSES } },
            { name: 'external_id', in: 'query', schema: { type: 'string' } },
            { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'starting_after', in: 'query', description: 'Cursor: `next_cursor` from the previous page.', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            200: {
              description: 'A page of orders',
              content: { 'application/json': { schema: { type: 'object', properties: { object: { const: 'list' }, data: { type: 'array', items: ref('Order') }, has_more: { type: 'boolean' }, next_cursor: { type: ['string', 'null'] } } } } },
            },
            ...errorResponses(400, 401, 403, 429),
          },
        },
      },
      '/orders/{id}': {
        parameters: [{ $ref: '#/components/parameters/OrderId' }],
        get: {
          tags: ['Orders'],
          summary: 'Retrieve an order',
          responses: { 200: { description: 'Order', content: { 'application/json': { schema: ref('Order') } } }, ...errorResponses(401, 404, 429) },
        },
        patch: {
          tags: ['Orders'],
          summary: 'Update address, customer, notes or metadata (only while `received`)',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKeyOptional' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { customer: Customer, shipping_address: { ...Address, required: [] }, notes: { type: ['string', 'null'] }, metadata: ref('Metadata') } } } },
          },
          responses: { 200: { description: 'Updated order', content: { 'application/json': { schema: ref('Order') } } }, ...errorResponses(400, 401, 404, 409, 422) },
        },
      },
      '/orders/{id}/cancel': {
        parameters: [{ $ref: '#/components/parameters/OrderId' }],
        post: {
          tags: ['Orders'],
          summary: 'Cancel an order (only while `received`)',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKeyOptional' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } } } } },
          responses: { 200: { description: 'Cancelled order', content: { 'application/json': { schema: ref('Order') } } }, ...errorResponses(401, 404, 409) },
        },
      },
      '/sku-mappings': {
        get: {
          tags: ['SKU mappings'],
          summary: 'List your SKU mappings',
          description: 'Sorted by `sku`. Requires `sku_mappings:read`.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
            { name: 'starting_after', in: 'query', description: 'The `next_cursor` of the previous page.', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Mappings', content: { 'application/json': { schema: { type: 'object', properties: { object: { const: 'list' }, data: { type: 'array', items: ref('SkuMapping') }, has_more: { type: 'boolean' }, next_cursor: { type: ['string', 'null'] } } } } } },
            ...errorResponses(401, 403, 429),
          },
        },
      },
      '/sku-mappings/bulk': {
        post: {
          tags: ['SKU mappings'],
          summary: 'Create or replace up to 1,000 mappings',
          description:
            'Each row is validated and applied on its own — one bad row does not fail the batch. Check `summary.failed` and each row\'s `error`. ' +
            'Re-sending the same rows is safe (they come back `unchanged`). Body limit 1 MB. Requires `sku_mappings:write`.',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKeyOptional' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['mappings'], properties: { mappings: { type: 'array', minItems: 1, maxItems: 1000, items: { allOf: [{ type: 'object', required: ['sku'], properties: { sku: { type: 'string', maxLength: 120 } } }, ref('SkuMappingInput')] } } } } } },
          },
          responses: { 200: { description: 'Per-row results', content: { 'application/json': { schema: ref('SkuMappingBulkResult') } } }, ...errorResponses(400, 401, 403, 429) },
        },
      },
      '/sku-mappings/{sku}': {
        parameters: [{ $ref: '#/components/parameters/Sku' }],
        get: {
          tags: ['SKU mappings'],
          summary: 'Retrieve a mapping',
          responses: { 200: { description: 'Mapping', content: { 'application/json': { schema: ref('SkuMapping') } } }, ...errorResponses(401, 403, 404) },
        },
        put: {
          tags: ['SKU mappings'],
          summary: 'Create or replace a mapping',
          description: 'Replaces the whole mapping (omitted fields are cleared). Safe to repeat. Requires `sku_mappings:write`.',
          requestBody: { required: true, content: { 'application/json': { schema: ref('SkuMappingInput') } } },
          responses: {
            200: { description: 'Updated (or unchanged)', content: { 'application/json': { schema: ref('SkuMapping') } } },
            201: { description: 'Created', content: { 'application/json': { schema: ref('SkuMapping') } } },
            ...errorResponses(400, 401, 403, 422),
          },
        },
        delete: {
          tags: ['SKU mappings'],
          summary: 'Delete a mapping',
          description: 'Orders sent with this SKU afterwards fail with `sku_not_found` unless it is a ShelfMerch SKU or listing id.',
          responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { object: { const: 'sku_mapping' }, sku: { type: 'string' }, deleted: { const: true } } } } } }, ...errorResponses(401, 403, 404) },
        },
      },
      '/orders/{id}/simulate': {
        parameters: [{ $ref: '#/components/parameters/OrderId' }],
        post: {
          tags: ['Orders'],
          summary: 'Sandbox: advance a test order (test keys only)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['in_production', 'shipped', 'delivered'] } } } } } },
          responses: { 200: { description: 'Advanced order (webhooks fire as for real orders)', content: { 'application/json': { schema: ref('Order') } } }, ...errorResponses(403, 404, 409) },
        },
      },
    },
    webhooks: Object.fromEntries(
      WEBHOOK_EVENT_TYPES.map((type) => [
        type,
        {
          post: {
            summary: `${type} event`,
            description: 'Signed with `ShelfMerch-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Respond 2xx within 10s. Dedupe by `ShelfMerch-Event-Id`.',
            requestBody: { content: { 'application/json': { schema: ref('Event') } } },
            responses: { 200: { description: 'Acknowledged' } },
          },
        },
      ]),
    ),
    components: {
      securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'smk_live_… or smk_test_…' } },
      parameters: {
        IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: true, description: 'Unique per logical request (e.g. a UUID). Retries with the same key return the original response for 24h.', schema: { type: 'string', maxLength: 255 } },
        IdempotencyKeyOptional: { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 255 } },
        OrderId: { name: 'id', in: 'path', required: true, description: 'ShelfMerch order id or order number (SM-2026-000123).', schema: { type: 'string' } },
        Sku: { name: 'sku', in: 'path', required: true, description: 'Your SKU, URL-encoded (e.g. `ACME%2FTEE-01`).', schema: { type: 'string', maxLength: 120 } },
      },
      schemas: {
        CatalogProduct: {
          type: 'object',
          properties: {
            object: { const: 'catalog_product' },
            id: { type: 'string', description: 'Stable product id — store it; use as product_id in orders.' },
            sku: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['active', 'discontinued'] },
            brand: { type: ['string', 'null'] },
            description: { type: 'string' },
            category: { type: 'object', properties: { path: { type: 'array', items: { type: 'string' } }, ids: { type: 'array', items: { type: 'string' } }, labels: { type: 'array', items: { type: 'string' } } } },
            images: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, position: { type: 'integer' }, primary: { type: 'boolean' } } } },
            price: { type: 'object', properties: { amount: { type: 'number' }, currency: { const: 'INR' }, tax_inclusive: { type: 'boolean' }, gst_rate: { type: 'number' } } },
            availability: { type: 'object', properties: { status: { type: 'string', enum: ['in_stock', 'out_of_stock', 'made_to_order', 'discontinued'] }, quantity: { type: ['integer', 'null'] } } },
            specifications: { type: 'object', description: 'material, hsn_code, gst_rate, min_order_quantity, production_days, dimensions_in, printable_areas, customization_methods' },
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Stable variant id — use as variant_id in orders.' },
                  sku: { type: 'string' },
                  sku_unique: { type: 'boolean', description: 'false when variants share a SKU — order those by variant_id.' },
                  size: { type: ['string', 'null'] },
                  color: { type: ['string', 'null'] },
                  color_hex: { type: ['string', 'null'] },
                  price: { type: 'object', properties: { amount: { type: 'number' }, currency: { const: 'INR' }, tax_inclusive: { type: 'boolean' } } },
                  available: { type: 'boolean' },
                },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CatalogImport: {
          type: 'object',
          properties: {
            object: { const: 'catalog_import' },
            id: { type: 'string' },
            status: { type: 'string', enum: ['completed', 'failed'] },
            summary: { type: 'object', properties: { requested: { type: 'integer' }, imported: { type: 'integer' }, updated: { type: 'integer' }, skipped: { type: 'integer' }, failed: { type: 'integer' } } },
            created_at: { type: 'string', format: 'date-time' },
            finished_at: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        SkuMappingInput: {
          type: 'object',
          required: ['catalog_sku'],
          additionalProperties: false,
          properties: {
            catalog_sku: { type: 'string', description: 'A ShelfMerch product SKU, or a variant SKU to fix size/colour (see `GET /products?type=catalog`).' },
            size: { type: 'string', description: 'Fix the size (with a product SKU). Omit to take size from each order line.' },
            color: { type: 'string', description: 'Fix the colour (with a product SKU). Omit to take colour from each order line.' },
            artwork_url: { type: ['string', 'null'], format: 'uri', description: 'https URL of print-ready artwork used for every order of this SKU.' },
          },
        },
        SkuMapping: {
          type: 'object',
          properties: {
            object: { const: 'sku_mapping' },
            sku: { type: 'string', description: 'Your SKU.' },
            catalog_sku: { type: 'string' },
            product_name: { type: 'string' },
            variant: { type: ['object', 'null'], description: 'null: size/colour come from each order line.', properties: { size: { type: ['string', 'null'] }, color: { type: ['string', 'null'] } } },
            artwork_url: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        SkuMappingBulkResult: {
          type: 'object',
          properties: {
            object: { const: 'sku_mapping_bulk_result' },
            summary: { type: 'object', properties: { created: { type: 'integer' }, updated: { type: 'integer' }, unchanged: { type: 'integer' }, failed: { type: 'integer' } } },
            data: {
              type: 'array',
              description: 'One entry per input row, in input order.',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer' },
                  sku: { type: ['string', 'null'] },
                  result: { type: 'string', enum: ['created', 'updated', 'unchanged', 'failed'] },
                  mapping: ref('SkuMapping'),
                  error: { type: 'object', properties: { code: { type: 'string', enum: ['invalid_row', 'duplicate_sku', 'catalog_sku_not_found', 'variant_not_found', 'variant_conflict', 'write_failed'] }, param: { type: ['string', 'null'] }, message: { type: 'string' } } },
                },
              },
            },
          },
        },
        Metadata: { type: 'object', maxProperties: 20, additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } },
        Address,
        Customer,
        CreateOrder: {
          type: 'object',
          required: ['external_id', 'shipping_address', 'items'],
          properties: {
            external_id: { type: 'string', maxLength: 100, description: 'Your order id. Unique per mode; a duplicate returns 409 `order_exists`.' },
            customer: Customer,
            shipping_address: Address,
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['quantity'],
                description: 'Identify the product with exactly one of `sku`, `product_id` or `variant_id`.',
                properties: {
                  sku: { type: 'string', description: 'Your mapped SKU, a branded listing id (`collectionId:productId`), or a ShelfMerch catalog/variant SKU.' },
                  product_id: { type: 'string', description: 'A catalog product `id` (GET /catalog/products); pick the variant with size/color.' },
                  variant_id: { type: 'string', description: 'A catalog variant `id` — the exact size/colour, no size/color needed.' },
                  quantity: { type: 'integer', minimum: 1, maximum: 10000 },
                  size: { type: 'string', description: '"2XL" and "XXL" are treated as the same size.' },
                  color: { type: 'string' },
                  artwork_url: { type: 'string', format: 'uri', description: 'https URL of print-ready artwork. Overrides mapped/listing artwork.' },
                },
              },
            },
            notes: { type: 'string', maxLength: 1000 },
            metadata: ref('Metadata'),
          },
        },
        Order: {
          type: 'object',
          properties: {
            object: { const: 'order' },
            id: { type: 'string' },
            number: { type: 'string', example: 'SM-2026-000123' },
            external_id: { type: 'string' },
            status: { type: 'string', enum: PUBLIC_ORDER_STATUSES },
            test: { type: 'boolean' },
            customer: Customer,
            shipping_address: Address,
            items: {
              type: 'array',
              items: { type: 'object', properties: { sku: { type: 'string' }, name: { type: 'string' }, quantity: { type: 'integer' }, size: { type: ['string', 'null'] }, color: { type: ['string', 'null'] }, unit_price: { type: 'number' }, image_url: { type: ['string', 'null'] }, artwork_url: { type: ['string', 'null'] } } },
            },
            amounts: { type: 'object', properties: { currency: { const: 'INR' }, subtotal: { type: 'number' }, shipping: { type: 'number' }, tax: { type: 'number' }, total: { type: 'number' } } },
            tracking: { type: ['object', 'null'], properties: { courier: { type: ['string', 'null'] }, awb: { type: ['string', 'null'] }, url: { type: ['string', 'null'] } } },
            notes: { type: ['string', 'null'] },
            metadata: ref('Metadata'),
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            object: { const: 'product' },
            sku: { type: 'string' },
            type: { type: 'string', enum: ['listing', 'mapped', 'catalog'] },
            name: { type: 'string' },
            image_url: { type: ['string', 'null'] },
            unit_price: { type: 'number' },
            currency: { const: 'INR' },
            variants: { type: 'array', items: { type: 'object', properties: { sku: { type: ['string', 'null'] }, size: { type: ['string', 'null'] }, color: { type: ['string', 'null'] }, unit_price: { type: 'number' } } } },
          },
        },
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'evt_8c1e…' },
            object: { const: 'event' },
            type: { type: 'string', enum: WEBHOOK_EVENT_TYPES },
            livemode: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            data: { type: 'object', properties: { object: ref('Order') } },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['type', 'code', 'message'],
              properties: {
                type: { type: 'string', enum: ['invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error', 'conflict_error', 'rate_limit_error', 'api_error'] },
                code: { type: 'string', example: 'validation_failed' },
                message: { type: 'string' },
                param: { type: 'string', example: 'items[1].sku' },
                details: { type: 'array', items: { type: 'object', properties: { param: { type: 'string' }, code: { type: 'string' }, message: { type: 'string' } } } },
                request_id: { type: 'string' },
              },
            },
          },
        },
      },
      responses: Object.fromEntries(
        [
          [400, 'Malformed request'],
          [401, 'Missing, invalid, revoked or expired API key'],
          [403, 'Key lacks the scope, or test-mode-only action'],
          [404, 'Not found (or not visible to this key)'],
          [409, 'Conflict: duplicate external_id, or the order can no longer be changed'],
          [422, 'Valid shape but cannot be fulfilled (unknown SKU, unavailable variant, bad pincode)'],
          [429, 'Rate limited — see Retry-After'],
        ].map(([code, description]) => [`E${code}`, { description, content: { 'application/json': { schema: ref('Error') } } }]),
      ),
    },
  };
}
