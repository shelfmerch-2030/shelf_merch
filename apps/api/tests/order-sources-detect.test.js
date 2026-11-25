import { describe, it, expect } from 'vitest';
import {
  buildFieldReport,
  suggestCustomRestConfig,
  suggestFields,
} from '../src/modules/orderSources/adapters/customRest.detect.js';
import { customRestAdapter, getPath, normalizeCustomOrder } from '../src/modules/orderSources/adapters/customRest.adapter.js';
import { customRestConfigSchema } from '../src/modules/orderSources/adapters/customRest.config.js';

/** Real response shape from a client API (ShelfMerch storefront orders). */
const STOREFRONT_RESPONSE = {
  data: [
    {
      id: '6b05409abfc5b765d2d1a308',
      store_id: '69fb287731cddd2043022527',
      customer_email: 'shabahathusain313@gmail.com',
      status: 'paid',
      items: [
        {
          product_id: '6a22a6ca17f50a837a9d6035',
          product_name: 'ProWear Polo',
          quantity: 1,
          price: 399,
          variant: { color: 'Maroon', size: '2XL' },
        },
      ],
      subtotal: 399,
      shipping: 68.43,
      tax: 71.82,
      total: 467.43,
      shipping_address: {
        full_name: 'husain',
        email: 'shabahathusain313@gmail.com',
        phone: '8341077173',
        address1: '164 rajeev nagar sector 10 India nagar near pani gaon palace',
        address2: '',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        zip_code: '226016',
        country: 'India',
      },
      fulfillment: { status: 'PAID', provider_orders: [] },
      created_at: '2026-11-24T07:45:30.941Z',
      updated_at: '2026-11-24T07:45:31.515Z',
    },
  ],
  meta: {
    pagination: { current_page: 1, per_page: 10, total_count: 1, total_pages: 1 },
    request_id: 'bd8e12f8-15f0-4ced-9ec0-37cf54e9f7a2',
  },
};

describe('custom REST auto-detection', () => {
  it('maps the storefront response end to end', () => {
    const s = suggestCustomRestConfig(STOREFRONT_RESPONSE, getPath);
    expect(s.itemsPath).toBe('data');
    expect(s.pagination).toEqual({ type: 'page', pageParam: 'page', sizeParam: 'per_page', startPage: 1 });
    expect(s.fields).toEqual({
      externalId: 'id',
      externalNumber: 'id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      status: 'status',
      total: 'total',
      customerName: 'shipping_address.full_name',
      customerEmail: 'customer_email',
      customerPhone: 'shipping_address.phone',
      shipName: 'shipping_address.full_name',
      shipPhone: 'shipping_address.phone',
      shipLine1: 'shipping_address.address1',
      shipLine2: 'shipping_address.address2',
      shipCity: 'shipping_address.city',
      shipState: 'shipping_address.state',
      shipPincode: 'shipping_address.zip_code',
      shipCountry: 'shipping_address.country',
      items: 'items',
      itemSku: 'product_id',
      itemName: 'product_name',
      itemQty: 'quantity',
      itemPrice: 'price',
      itemSize: 'variant.size',
      itemColor: 'variant.color',
    });

    // Applying the suggestion yields a complete normalized order.
    const config = customRestConfigSchema.parse({
      baseUrl: 'http://localhost:8081/api/v1',
      orders: { itemsPath: s.itemsPath, pagination: s.pagination },
      fields: s.fields,
    });
    const n = normalizeCustomOrder(STOREFRONT_RESPONSE.data[0], config);
    expect(n).toMatchObject({
      externalId: '6b05409abfc5b765d2d1a308',
      status: 'open',
      customer: { name: 'husain', email: 'shabahathusain313@gmail.com', phone: '8341077173' },
      shippingAddress: { line1: '164 rajeev nagar sector 10 India nagar near pani gaon palace', city: 'Lucknow', pincode: '226016', country: 'IN' },
      items: [{ externalSku: '6a22a6ca17f50a837a9d6035', name: 'ProWear Polo', qty: 1, unitPrice: 399, variant: { size: '2XL', color: 'Maroon' } }],
    });
  });

  it('handles a Shopify-like REST order (line_items, shipping_address, nested customer)', () => {
    const order = {
      id: 450789469,
      name: '#1001',
      created_at: '2026-11-20T10:00:00-05:00',
      updated_at: '2026-11-20T10:05:00-05:00',
      financial_status: 'paid',
      total_price: '598.94',
      email: 'bob@example.com',
      customer: { id: 207119551, first_name: 'Bob', email: 'bob@example.com', phone: '+16136120707' },
      billing_address: { name: 'Bob Billing', address1: '2 Bill St', city: 'Ottawa', zip: 'K2P 1L4' },
      shipping_address: { name: 'Bob Norman', address1: 'Chestnut Street 92', address2: '', city: 'Louisville', province: 'Kentucky', zip: '40202', country_code: 'US', phone: '555-625-1199' },
      line_items: [{ id: 466157049, sku: 'IPOD2008GREEN', title: 'IPod Nano', quantity: 1, price: '199.00' }],
    };
    const { fields } = suggestFields(order);
    expect(fields).toMatchObject({
      externalId: 'id',
      externalNumber: 'name',
      status: 'financial_status',
      total: 'total_price',
      customerEmail: 'customer.email',
      customerPhone: 'customer.phone',
      shipName: 'shipping_address.name',
      shipLine1: 'shipping_address.address1',
      shipCity: 'shipping_address.city',
      shipState: 'shipping_address.province',
      shipPincode: 'shipping_address.zip',
      shipCountry: 'shipping_address.country_code',
      items: 'line_items',
      itemSku: 'sku',
      itemName: 'title',
      itemQty: 'quantity',
      itemPrice: 'price',
    });
  });

  it('handles a WooCommerce-like order (shipping block, postcode, meta-less root array)', () => {
    const body = [
      {
        id: 727,
        number: '727',
        status: 'processing',
        date_created: '2026-11-20T10:00:00',
        date_modified: '2026-11-20T11:00:00',
        total: '29.35',
        billing: { first_name: 'John', email: 'john.doe@example.com', phone: '(555) 555-5555', address_1: '969 Market', postcode: '94103' },
        shipping: { first_name: 'John', address_1: '969 Market', address_2: '', city: 'San Francisco', state: 'CA', postcode: '94103', country: 'US' },
        line_items: [{ id: 315, name: 'Woo Single #1', product_id: 93, quantity: 2, sku: '', price: 3 }],
      },
    ];
    const s = suggestCustomRestConfig(body, getPath);
    expect(s.itemsPath).toBe('');
    expect(s.pagination).toBeNull();
    expect(s.fields).toMatchObject({
      externalNumber: 'number',
      customerEmail: 'billing.email',
      shipCity: 'shipping.city',
      shipPincode: 'shipping.postcode',
      shipState: 'shipping.state',
      items: 'line_items',
      itemQty: 'quantity',
    });
    // Ship fields never come from billing when a shipping block exists.
    expect(s.fields.shipLine1).toBe('shipping.address_1');
  });

  it('detects cursor pagination', () => {
    const s = suggestCustomRestConfig({ orders: [{ id: 'a', items: [{ sku: 'x', qty: 1 }] }], paging: { next_cursor: 'abc' } }, getPath);
    expect(s.itemsPath).toBe('orders');
    expect(s.pagination).toMatchObject({ type: 'cursor', nextCursorPath: 'paging.next_cursor' });
  });
});

describe('field report', () => {
  it('shows each configured value and suggests fixes for the defaults', () => {
    const s = suggestCustomRestConfig(STOREFRONT_RESPONSE, getPath);
    const defaults = customRestConfigSchema.parse({ baseUrl: 'http://x.example' }).fields;
    const report = buildFieldReport(STOREFRONT_RESPONSE.data[0], defaults, s, getPath);
    const row = (f) => report.find((r) => r.field === f);

    expect(row('shipCity')).toMatchObject({ path: 'shipping_address.city', value: 'Lucknow', ok: true, suggested: null });
    expect(row('itemSku')).toMatchObject({ path: 'sku', value: null, ok: false, required: true, suggested: 'product_id', suggestedValue: '6a22a6ca17f50a837a9d6035' });
    expect(row('customerName')).toMatchObject({ ok: false, suggested: 'shipping_address.full_name', suggestedValue: 'husain' });
    expect(row('shipPincode')).toMatchObject({ ok: false, required: true, suggested: 'shipping_address.zip_code', suggestedValue: '226016' });
    expect(row('items')).toMatchObject({ value: '[1 item]', ok: true });
  });
});

describe('preview (testConnection)', () => {
  it('returns a suggestion even when the orders-array path is wrong', async () => {
    const fetchImpl = async () => new Response(JSON.stringify(STOREFRONT_RESPONSE), { status: 200 });
    const config = customRestConfigSchema.parse({ baseUrl: 'http://localhost:8081/api/v1', auth: { type: 'none' }, orders: { itemsPath: 'array' } });
    const res = await customRestAdapter.testConnection({ config, credentials: {} }, { fetchImpl });
    expect(res.sample).toEqual([]);
    expect(res.itemsPathError).toMatch(/Set "Orders array in response" to "data"/);
    expect(res.suggestion.itemsPath).toBe('data');
    expect(res.rawSample.id).toBe('6b05409abfc5b765d2d1a308');
  });
});
