import { z } from 'zod';

/**
 * Config for a client's own order API — no code per client.
 * Field paths are dotted ("shipping.address.city", "lines.0.sku"); '' means
 * "the value itself" (e.g. itemsPath '' when the response is a bare array).
 * Secrets (API key, token, password) live in encrypted credentials, never here.
 */
const fieldPath = z.string().trim().max(200).regex(/^[\w.$-]*$/, 'Use dotted paths like customer.email');
const paramName = z.string().trim().min(1).max(60).regex(/^[\w.[\]-]+$/);

export const customRestFieldsSchema = z.object({
  externalId: fieldPath.default('id'),
  externalNumber: fieldPath.default('order_number'),
  createdAt: fieldPath.default('created_at'),
  updatedAt: fieldPath.default('updated_at'),
  status: fieldPath.default('status'),
  customerName: fieldPath.default('customer.name'),
  customerEmail: fieldPath.default('customer.email'),
  customerPhone: fieldPath.default('customer.phone'),
  shipName: fieldPath.default('shipping_address.name'),
  shipPhone: fieldPath.default('shipping_address.phone'),
  shipLine1: fieldPath.default('shipping_address.line1'),
  shipLine2: fieldPath.default('shipping_address.line2'),
  shipCity: fieldPath.default('shipping_address.city'),
  shipState: fieldPath.default('shipping_address.state'),
  shipPincode: fieldPath.default('shipping_address.pincode'),
  shipCountry: fieldPath.default('shipping_address.country'),
  items: fieldPath.default('items'),
  itemSku: fieldPath.default('sku'),
  itemName: fieldPath.default('name'),
  itemQty: fieldPath.default('quantity'),
  itemPrice: fieldPath.default('price'),
  itemSize: fieldPath.default('size'),
  itemColor: fieldPath.default('color'),
  total: fieldPath.default('total'),
});

export const customRestConfigSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  auth: z
    .object({
      type: z.enum(['none', 'api_key_header', 'api_key_query', 'bearer', 'basic']).default('api_key_header'),
      headerName: paramName.default('X-API-Key'),
      queryParam: paramName.default('api_key'),
    })
    .prefault({}),
  orders: z
    .object({
      path: z.string().trim().startsWith('/').max(300).default('/orders'),
      query: z.record(paramName, z.string().max(200)).prefault({}),
      itemsPath: fieldPath.default(''),
      sinceParam: paramName.default('updated_since'),
      sinceFormat: z.enum(['iso', 'unix', 'unix_ms']).default('iso'),
      pagination: z
        .object({
          type: z.enum(['none', 'page', 'offset', 'cursor']).default('page'),
          pageParam: paramName.default('page'),
          sizeParam: paramName.default('limit'),
          pageSize: z.coerce.number().int().min(1).max(250).default(50),
          startPage: z.coerce.number().int().min(0).default(1),
          offsetParam: paramName.default('offset'),
          cursorParam: paramName.default('cursor'),
          nextCursorPath: fieldPath.default('next_cursor'),
        })
        .prefault({}),
    })
    .prefault({}),
  fields: customRestFieldsSchema.prefault({}),
  cancelledStatuses: z.array(z.string().trim().toLowerCase()).max(20).default(['cancelled', 'canceled']),
  /**
   * Optional: the client's product catalog, for bulk catalog matching.
   * One row per variant when `fields.variants` resolves to an array, else one per product.
   * Uses the orders pagination style unless overridden.
   */
  products: z
    .object({
      path: z.string().trim().startsWith('/').max(300).default('/products'),
      itemsPath: fieldPath.default(''),
      query: z.record(paramName, z.string().max(200)).prefault({}),
      fields: z
        .object({
          sku: fieldPath.default('sku'),
          barcode: fieldPath.default('barcode'),
          name: fieldPath.default('name'),
          brand: fieldPath.default('brand'),
          model: fieldPath.default('model'),
          category: fieldPath.default('category'),
          size: fieldPath.default('size'),
          color: fieldPath.default('color'),
          material: fieldPath.default('material'),
          imageUrl: fieldPath.default('image'),
          variants: fieldPath.default('variants'),
          variantSku: fieldPath.default('sku'),
          variantBarcode: fieldPath.default('barcode'),
          variantSize: fieldPath.default('size'),
          variantColor: fieldPath.default('color'),
        })
        .prefault({}),
    })
    .nullable()
    .default(null),
  /** Optional: where to send tracking when an order ships. {externalId} is substituted. */
  fulfillment: z
    .object({
      path: z.string().trim().startsWith('/').max(300),
      method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
    })
    .nullable()
    .default(null),
});

export const customRestCredentialsSchema = z.object({
  apiKey: z.string().max(1000).optional(),
  token: z.string().max(2000).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
});
