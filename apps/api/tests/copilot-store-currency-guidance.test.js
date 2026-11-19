// Pure guidance/schema/service regressions. All persistence is mocked; no DB connection.
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROMPT } from '../src/modules/copilot/copilotChat.service.js';
import { createShopSchema, updateShopSchema } from '../src/modules/shops/shops.validation.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import * as shopsService from '../src/modules/shops/shops.service.js';
import { listShopsForCaller, shopsReadText } from '../src/modules/mcp/shopsRead.js';
import { shopsPrepareCreateInputSchema, shopsPrepareUpdateInputSchema, SHOPS_PREPARE_CREATE_DESCRIPTION, SHOPS_PREPARE_UPDATE_DESCRIPTION, DEFAULT_STORE_BANNER_CONFIG } from '../src/modules/mcp/shopsWrite.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { toolContentForModel, formatAssistantTextForCards } from '../src/modules/copilot/copilotResponseFormat.js';

const tenantId = '507f1f77bcf86cd799439011', userId = '507f1f77bcf86cd799439012', shopId = '507f1f77bcf86cd799439013';
beforeEach(() => {
  vi.spyOn(mongoose, 'connect').mockImplementation(() => { throw new Error('Database connections forbidden in guidance tests'); });
  vi.spyOn(mongoose.Model.prototype, 'save').mockImplementation(() => { throw new Error('Database writes forbidden in guidance tests'); });
});
afterEach(() => {
  expect(mongoose.connection.readyState).toBe(0);
  expect(mongoose.connect).not.toHaveBeenCalled();
  expect(mongoose.Model.prototype.save).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('store listing and count guidance', () => {
  it.each([
    { shops: [] },
    { shops: [{ _id: shopId, name: 'Existing store', slug: 'existing-store', status: 'live', currencyMode: 'points', categories: ['Merch'] }] },
  ])('reports the authorized store list without manufacturing currency advice', async ({ shops }) => {
    vi.spyOn(User, 'findOne').mockResolvedValue({ _id: userId, status: 'active' });
    vi.spyOn(RoleAssignment, 'findOne').mockResolvedValue({ role: 'company_admin' });
    vi.spyOn(shopsService, 'listShops').mockResolvedValue(shops);
    const ctx = buildCopilotToolCtx({ tenantId, user: { userId, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
    const result = await listShopsForCaller(ctx, {});
    expect(result.shops).toHaveLength(shops.length);
    expect(shopsService.listShops).toHaveBeenCalledWith({ tenantId });
    const modelContent = toolContentForModel('shops_list', result, []);
    expect(JSON.parse(modelContent).shops).toHaveLength(shops.length);
    const text = shopsReadText(result, 'Stores.');
    if (!shops.length) expect(text).toContain('No stores found.');
    expect(text).not.toMatch(/permanent|cannot be changed|confirm|create a store/i);
    expect(formatAssistantTextForCards('There are 0 stores.', [])).toBe('There are 0 stores.');
  });

  it('scopes count answers to tool data and keeps currency restrictions out of listing advice', () => {
    expect(SYSTEM_PROMPT).toMatch(/store listing or count questions[^.]*shops_list results only; an empty list means zero stores/i);
    expect(SYSTEM_PROMPT).toMatch(/Do not append store creation steps, currency restrictions, or a creation offer unless the user asks/);
    const fields = SYSTEM_PROMPT.match(/Store creation fields:[^.]+\./)?.[0];
    expect(fields).toMatch(/store name, currency \(points or INR\), optional logo, optional banner/);
    expect(fields).not.toMatch(/permanent|cannot be changed/);
  });
});

describe('verified currency editing policy', () => {
  it.each(['points', 'inr'])('allows %s at creation, but not through the dashboard or MCP update schema', mode => {
    expect(createShopSchema.parse({ name: 'Synthetic store', currencyMode: mode }).currencyMode).toBe(mode);
    expect(shopsPrepareCreateInputSchema.parse({ name: 'Synthetic store', currencyMode: mode }).currencyMode).toBe(mode);
    expect(updateShopSchema.parse({ name: 'Renamed', currencyMode: mode })).not.toHaveProperty('currencyMode');
    expect(shopsPrepareUpdateInputSchema.safeParse({ shopId, name: 'Renamed', currencyMode: mode }).success).toBe(false);
  });

  it.each([['draft', 'points', 'inr'], ['draft', 'inr', 'points'], ['live', 'points', 'inr'], ['live', 'inr', 'points']])('the existing service preserves %s store currency %s when asked to switch to %s', async (status, original, requested) => {
    const before = { _id: shopId, tenantId, slug: 'existing-store', name: 'Existing store', status, currencyMode: original };
    const shop = { ...before, toObject: () => ({ ...before }), save: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(Shop, 'findOne').mockResolvedValue(shop);
    const result = await shopsService.updateShop({ tenantId, shopId, patch: { name: 'Renamed', currencyMode: requested } });
    expect(result.shop.currencyMode).toBe(original);
    expect(result.shop.name).toBe('Renamed');
    expect(shop.save).toHaveBeenCalledOnce(); // Fake object only; no model save/database.
  });

  it('answers currency-editing questions with the verified limitation instead of offering a write', () => {
    expect(SYSTEM_PROMPT).toMatch(/restrictions only when collecting currency for an explicitly requested creation or answering a currency-editing question/);
    expect(SYSTEM_PROMPT).toMatch(/currencyMode cannot be changed after creation, including draft stores/);
    expect(SYSTEM_PROMPT).toMatch(/neither dashboard editing nor Copilot\/MCP updates support switching it/);
    expect(SYSTEM_PROMPT).toMatch(/Do not offer an unsupported currency-editing operation/);
    expect(SHOPS_PREPARE_UPDATE_DESCRIPTION).toMatch(/currency mode are rejected/);
  });

  it('does not confuse editable point conversion with switching INR/Points currency mode', () => {
    expect(updateShopSchema.parse({ pointsConversionEnabled: true })).toEqual({ pointsConversionEnabled: true });
    expect(shopsPrepareUpdateInputSchema.parse({ shopId, pointsConversionEnabled: true })).toMatchObject({ pointsConversionEnabled: true });
    expect(SYSTEM_PROMPT).toContain('pointsConversionEnabled is a separate setting and does not change currencyMode');
  });

  it.each([true, false])('persists pointsConversionEnabled=%s through the existing update service without changing currency', async enabled => {
    const before = { _id: shopId, tenantId, slug: 'existing-store', name: 'Existing store', status: 'live', currencyMode: 'inr', pointsConversionEnabled: !enabled };
    const shop = { ...before, toObject: () => ({ ...before }), save: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(Shop, 'findOne').mockResolvedValue(shop);
    const result = await shopsService.updateShop({ tenantId, shopId, patch: { pointsConversionEnabled: enabled } });
    expect(result.shop.pointsConversionEnabled).toBe(enabled);
    expect(result.shop.currencyMode).toBe('inr');
    expect(shop.save).toHaveBeenCalledOnce();
  });
});

describe('existing store creation guidance', () => {
  it('allows creation without a banner and directs optional later changes through the actual Store Layout controls', () => {
    const input = shopsPrepareCreateInputSchema.parse({ name: 'Synthetic store', currencyMode: 'points' });
    expect(input.bannerConfig).toBeUndefined();
    expect(input.bannerTicketId).toBeUndefined();
    expect(DEFAULT_STORE_BANNER_CONFIG).toEqual({ theme: 'dark', preset: 'solid-pattern' });
    expect(SYSTEM_PROMPT).toContain('Banner selection is optional and is not required before store creation');
    expect(SYSTEM_PROMPT).toContain('use the existing default banner and continue to PREPARE and confirmation');
    expect(SYSTEM_PROMPT).toContain('Store Layout: open the store → Layout → Top banner → Edit banner');
    expect(SYSTEM_PROMPT).toContain('Banner library, Solid colour or Custom banner → Save changes');
    expect(SYSTEM_PROMPT).toContain('does not require recreating or republishing the store');
    expect(SHOPS_PREPARE_CREATE_DESCRIPTION).toContain('Do not delay prepare or confirmation for an optional banner choice');
  });

  it('retains attachment logos, supported banners, explicit confirmation and create/publish Live behavior', () => {
    expect(SYSTEM_PROMPT).toMatch(/optional logo, optional banner \(choose from existing ShelfMerch presets\)/);
    expect(SYSTEM_PROMPT).toContain('use the + button in chat');
    expect(SYSTEM_PROMPT).toContain('pass that id directly into shops_prepare_create or shops_prepare_update');
    expect(SYSTEM_PROMPT).toContain('Explain before confirmation that the new store will be live');
    expect(SYSTEM_PROMPT).toContain('Only report Live after a successful tool result says live');
    expect(SHOPS_PREPARE_CREATE_DESCRIPTION).toMatch(/Currency cannot be changed after creation/);
    expect(shopsPrepareCreateInputSchema.parse({ name: 'Synthetic store', currencyMode: 'inr', logoTicketId: 'synthetic-logo-ticket', bannerConfig: { theme: 'dark', preset: 'solid-pattern' } })).toMatchObject({ logoTicketId: 'synthetic-logo-ticket', currencyMode: 'inr' });
    expect(shopsPrepareCreateInputSchema.safeParse({ name: 'Synthetic store', bannerConfig: { preset: 'unsupported-preset' } }).success).toBe(false);
  });
});
