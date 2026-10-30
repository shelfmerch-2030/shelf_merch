import { createMcpHandler, McpServer, requireScopes } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { logger } from '../../config/logger.js';
import {
  CATALOG_SEARCH_DESCRIPTION,
  catalogSearchInputSchema,
  catalogSearchOutputSchema,
  catalogSearchText,
  searchCatalog,
} from './catalogSearch.js';
import {
  CATALOG_GET_PRODUCT_DESCRIPTION,
  CATALOG_LIST_CATEGORIES_DESCRIPTION,
  catalogCategoriesText,
  catalogGetProductInputSchema,
  catalogGetProductOutputSchema,
  catalogListCategoriesInputSchema,
  catalogListCategoriesOutputSchema,
  catalogProductText,
  getCatalogProduct,
  listCatalogCategories,
} from './catalogRead.js';
import {
  ORDERS_GET_DESCRIPTION,
  ORDERS_SEARCH_DESCRIPTION,
  getOrderForCaller,
  orderDetailText,
  orderToolError,
  ordersGetInputSchema,
  ordersGetOutputSchema,
  ordersSearchInputSchema,
  ordersSearchOutputSchema,
  ordersSearchText,
  searchOrdersForCaller,
} from './ordersRead.js';
import {
  CAMPAIGNS_GET_DESCRIPTION,
  CAMPAIGNS_SEARCH_DESCRIPTION,
  campaignDetailText,
  campaignToolError,
  campaignsGetInputSchema,
  campaignsGetOutputSchema,
  campaignsSearchInputSchema,
  campaignsSearchOutputSchema,
  campaignsSearchText,
  getCampaignForCaller,
  searchCampaignsForCaller,
} from './campaignsRead.js';
import {
  WALLET_BALANCES_DESCRIPTION,
  WALLET_TRANSACTIONS_DESCRIPTION,
  listBalancesForCaller,
  listTransactionsForCaller,
  walletBalancesInputSchema,
  walletBalancesOutputSchema,
  walletBalancesText,
  walletToolError,
  walletTransactionsInputSchema,
  walletTransactionsOutputSchema,
  walletTransactionsText,
} from './walletsRead.js';
import {
  EMPLOYEES_GET_DESCRIPTION,
  EMPLOYEES_SEARCH_DESCRIPTION,
  employeeDetailText,
  employeeToolError,
  employeesGetInputSchema,
  employeesGetOutputSchema,
  employeesSearchInputSchema,
  employeesSearchOutputSchema,
  employeesSearchText,
  getEmployeeForCaller,
  searchEmployeesForCaller,
} from './employeesRead.js';
import {
  GIFTS_SEARCH_DESCRIPTION,
  POINTS_SUMMARY_DESCRIPTION,
  giftsSearchInputSchema,
  giftsSearchOutputSchema,
  giftsSearchText,
  pointsGiftsToolError,
  pointsSummaryInputSchema,
  pointsSummaryOutputSchema,
  pointsSummaryText,
  searchGiftsForCaller,
  summarizePointsForCaller,
} from './pointsGiftsRead.js';

/**
 * Stateless JSON handler. A fresh server is built per request and nothing is
 * stored between calls, so any of the three API replicas can serve the next
 * request. Subscription streams are refused because an in-memory listen bus
 * would not be shared across replicas.
 */
export const shelfMerchMcpHandler = createMcpHandler(
  () => {
    const server = new McpServer({ name: 'shelfmerch', version: '0.1.0' });
    server.registerTool(
      'catalog_search',
      {
        title: 'Search catalog',
        description: CATALOG_SEARCH_DESCRIPTION,
        inputSchema: catalogSearchInputSchema,
        outputSchema: catalogSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
        },
      },
      async (args) => {
        try {
          const output = await searchCatalog(args);
          return {
            content: [{ type: 'text', text: catalogSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Catalog search failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'catalog_get_product',
      {
        title: 'Get catalog product',
        description: CATALOG_GET_PRODUCT_DESCRIPTION,
        inputSchema: catalogGetProductInputSchema,
        outputSchema: catalogGetProductOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
        },
      },
      async (args) => {
        try {
          const output = await getCatalogProduct(args.productId);
          if (!output) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Product not found.' }],
            };
          }
          return {
            content: [{ type: 'text', text: catalogProductText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_get_product failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Product lookup failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'catalog_list_categories',
      {
        title: 'List catalog categories',
        description: CATALOG_LIST_CATEGORIES_DESCRIPTION,
        inputSchema: catalogListCategoriesInputSchema,
        outputSchema: catalogListCategoriesOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
        },
      },
      async () => {
        try {
          const output = await listCatalogCategories();
          return {
            content: [{ type: 'text', text: catalogCategoriesText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_list_categories failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Category list failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'orders_search',
      {
        title: 'Search orders',
        description: ORDERS_SEARCH_DESCRIPTION,
        inputSchema: ordersSearchInputSchema,
        outputSchema: ordersSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('orders:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['orders:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchOrdersForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: ordersSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP orders_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: orderToolError(err, 'Order search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'orders_get',
      {
        title: 'Get order',
        description: ORDERS_GET_DESCRIPTION,
        inputSchema: ordersGetInputSchema,
        outputSchema: ordersGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('orders:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['orders:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getOrderForCaller(ctx, args.orderId);
          return {
            content: [{ type: 'text', text: orderDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP orders_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: orderToolError(err, 'Order lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'campaigns_search',
      {
        title: 'Search campaigns',
        description: CAMPAIGNS_SEARCH_DESCRIPTION,
        inputSchema: campaignsSearchInputSchema,
        outputSchema: campaignsSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('campaigns:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchCampaignsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: campaignsSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP campaigns_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: campaignToolError(err, 'Campaign search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'campaigns_get',
      {
        title: 'Get campaign',
        description: CAMPAIGNS_GET_DESCRIPTION,
        inputSchema: campaignsGetInputSchema,
        outputSchema: campaignsGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('campaigns:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getCampaignForCaller(ctx, args.campaignId);
          return {
            content: [{ type: 'text', text: campaignDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP campaigns_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: campaignToolError(err, 'Campaign lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'wallet_list_balances',
      {
        title: 'List wallet balances',
        description: WALLET_BALANCES_DESCRIPTION,
        inputSchema: walletBalancesInputSchema,
        outputSchema: walletBalancesOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (_args, ctx) => {
        try {
          const output = await listBalancesForCaller(ctx);
          return {
            content: [{ type: 'text', text: walletBalancesText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP wallet_list_balances failed');
          return {
            isError: true,
            content: [{ type: 'text', text: walletToolError(err, 'Wallet list failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'wallet_list_transactions',
      {
        title: 'List wallet transactions',
        description: WALLET_TRANSACTIONS_DESCRIPTION,
        inputSchema: walletTransactionsInputSchema,
        outputSchema: walletTransactionsOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await listTransactionsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: walletTransactionsText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP wallet_list_transactions failed');
          return {
            isError: true,
            content: [{ type: 'text', text: walletToolError(err, 'Transaction list failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'employees_search',
      {
        title: 'Search employees',
        description: EMPLOYEES_SEARCH_DESCRIPTION,
        inputSchema: employeesSearchInputSchema,
        outputSchema: employeesSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('employees:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['employees:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchEmployeesForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: employeesSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP employees_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: employeeToolError(err, 'Employee search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'employees_get',
      {
        title: 'Get employee',
        description: EMPLOYEES_GET_DESCRIPTION,
        inputSchema: employeesGetInputSchema,
        outputSchema: employeesGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('employees:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['employees:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getEmployeeForCaller(ctx, args.contactId);
          return {
            content: [{ type: 'text', text: employeeDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP employees_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: employeeToolError(err, 'Employee lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'points_summary',
      {
        title: 'Summarize points credits',
        description: POINTS_SUMMARY_DESCRIPTION,
        inputSchema: pointsSummaryInputSchema,
        outputSchema: pointsSummaryOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (_args, ctx) => {
        try {
          const output = await summarizePointsForCaller(ctx);
          return {
            content: [{ type: 'text', text: pointsSummaryText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP points_summary failed');
          return {
            isError: true,
            content: [{ type: 'text', text: pointsGiftsToolError(err, 'Points summary failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'gifts_search',
      {
        title: 'Search gifts',
        description: GIFTS_SEARCH_DESCRIPTION,
        inputSchema: giftsSearchInputSchema,
        outputSchema: giftsSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('gifts:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['gifts:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchGiftsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: giftsSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP gifts_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: pointsGiftsToolError(err, 'Gift search failed.') }],
          };
        }
      },
    );
    return server;
  },
  { responseMode: 'json', maxSubscriptions: 0 },
);

const nodeHandler = toNodeHandler(shelfMerchMcpHandler);

export function handleShelfMerchMcp(req, res, next) {
  Promise.resolve(nodeHandler(req, res, req.body)).catch((err) => {
    if (!res.headersSent) next(err);
  });
}