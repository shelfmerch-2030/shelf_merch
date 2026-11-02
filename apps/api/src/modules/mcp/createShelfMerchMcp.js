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
  EMPLOYEES_EXECUTE_CREATE_DESCRIPTION,
  EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION,
  EMPLOYEES_PREPARE_CREATE_DESCRIPTION,
  EMPLOYEES_PREPARE_UPDATE_DESCRIPTION,
  employeeWriteError,
  employeeWriteText,
  employeesExecuteCreateInputSchema,
  employeesExecuteCreateOutputSchema,
  employeesExecuteUpdateInputSchema,
  employeesExecuteUpdateOutputSchema,
  employeesPrepareCreateInputSchema,
  employeesPrepareCreateOutputSchema,
  employeesPrepareUpdateInputSchema,
  employeesPrepareUpdateOutputSchema,
  executeEmployeeCreateForCaller,
  executeEmployeeUpdateForCaller,
  prepareEmployeeCreateForCaller,
  prepareEmployeeUpdateForCaller,
} from './employeesWrite.js';
import {
  CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION,
  CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION,
  campaignsExecutePointsDraftInputSchema,
  campaignsExecutePointsDraftOutputSchema,
  campaignsPreparePointsDraftInputSchema,
  campaignsPreparePointsDraftOutputSchema,
  executePointsDraftForCaller,
  pointsDraftError,
  pointsDraftText,
  preparePointsDraftForCaller,
} from './campaignsDraftWrite.js';
import {
  SHOPS_EXECUTE_CREATE_DESCRIPTION,
  SHOPS_EXECUTE_UPDATE_DESCRIPTION,
  SHOPS_PREPARE_CREATE_DESCRIPTION,
  SHOPS_PREPARE_UPDATE_DESCRIPTION,
  executeShopCreateForCaller,
  executeShopUpdateForCaller,
  prepareShopCreateForCaller,
  prepareShopUpdateForCaller,
  shopWriteError,
  shopWriteText,
  shopsExecuteCreateInputSchema,
  shopsExecuteCreateOutputSchema,
  shopsExecuteUpdateInputSchema,
  shopsExecuteUpdateOutputSchema,
  shopsPrepareCreateInputSchema,
  shopsPrepareCreateOutputSchema,
  shopsPrepareUpdateInputSchema,
  shopsPrepareUpdateOutputSchema,
} from './shopsWrite.js';
import {
  SHOPS_EXECUTE_CATALOG_DESCRIPTION,
  SHOPS_PREPARE_CATALOG_DESCRIPTION,
  executeShopCatalogUpdateForCaller,
  prepareShopCatalogUpdateForCaller,
  shopCatalogError,
  shopCatalogText,
  shopsExecuteCatalogInputSchema,
  shopsExecuteCatalogOutputSchema,
  shopsPrepareCatalogInputSchema,
  shopsPrepareCatalogOutputSchema,
} from './shopsCatalogWrite.js';
import {
  BUDGET_EXECUTE_DESCRIPTION,
  BUDGET_PREPARE_DESCRIPTION,
  budgetError,
  budgetExecuteInputSchema,
  budgetExecuteOutputSchema,
  budgetPrepareInputSchema,
  budgetPrepareOutputSchema,
  budgetText,
  executeBudgetAllocationForCaller,
  prepareBudgetAllocationForCaller,
} from './budgetsWrite.js';
import {
  CREDIT_EXECUTE_DESCRIPTION,
  CREDIT_PREPARE_DESCRIPTION,
  LAUNCH_EXECUTE_DESCRIPTION,
  LAUNCH_PREPARE_DESCRIPTION,
  campaignSendError,
  campaignSendText,
  creditExecuteInputSchema,
  creditExecuteOutputSchema,
  creditPrepareInputSchema,
  creditPrepareOutputSchema,
  executeCreditAllocationForCaller,
  executeLaunchForCaller,
  launchExecuteInputSchema,
  launchExecuteOutputSchema,
  launchPrepareInputSchema,
  launchPrepareOutputSchema,
  prepareCreditAllocationForCaller,
  prepareLaunchForCaller,
} from './campaignsSendWrite.js';
import {
  COLLECTION_EXECUTE_DRAFT_DESCRIPTION,
  COLLECTION_EXECUTE_PUBLISH_DESCRIPTION,
  COLLECTION_PREPARE_DRAFT_DESCRIPTION,
  COLLECTION_PREPARE_PUBLISH_DESCRIPTION,
  collectionError,
  collectionExecuteDraftForCaller,
  collectionExecuteDraftInputSchema,
  collectionExecuteDraftOutputSchema,
  collectionExecutePublishForCaller,
  collectionExecutePublishInputSchema,
  collectionExecutePublishOutputSchema,
  collectionPrepareDraftForCaller,
  collectionPrepareDraftInputSchema,
  collectionPrepareDraftOutputSchema,
  collectionPreparePublishForCaller,
  collectionPreparePublishInputSchema,
  collectionPreparePublishOutputSchema,
  collectionText,
} from './shopsCollectionWrite.js';
import {
  MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION,
  MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION,
  MERCHANDISE_PREPARE_DRAFT_DESCRIPTION,
  MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION,
  executeMerchandiseDraftForCaller,
  executeMerchandiseLaunchForCaller,
  merchandiseError,
  merchandiseExecuteDraftInputSchema,
  merchandiseExecuteDraftOutputSchema,
  merchandiseExecuteLaunchInputSchema,
  merchandiseExecuteLaunchOutputSchema,
  merchandisePrepareDraftInputSchema,
  merchandisePrepareDraftOutputSchema,
  merchandisePrepareLaunchInputSchema,
  merchandisePrepareLaunchOutputSchema,
  merchandiseText,
  prepareMerchandiseDraftForCaller,
  prepareMerchandiseLaunchForCaller,
} from './campaignsMerchandiseWrite.js';
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
    const employeeWriteTools = [
      ['employees_prepare_create', 'Prepare employee create', EMPLOYEES_PREPARE_CREATE_DESCRIPTION, employeesPrepareCreateInputSchema, employeesPrepareCreateOutputSchema, false, prepareEmployeeCreateForCaller, 'Employee create preview failed.'],
      ['employees_execute_create', 'Create employee', EMPLOYEES_EXECUTE_CREATE_DESCRIPTION, employeesExecuteCreateInputSchema, employeesExecuteCreateOutputSchema, true, executeEmployeeCreateForCaller, 'Employee create failed.'],
      ['employees_prepare_update', 'Prepare employee update', EMPLOYEES_PREPARE_UPDATE_DESCRIPTION, employeesPrepareUpdateInputSchema, employeesPrepareUpdateOutputSchema, false, prepareEmployeeUpdateForCaller, 'Employee update preview failed.'],
      ['employees_execute_update', 'Update employee', EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION, employeesExecuteUpdateInputSchema, employeesExecuteUpdateOutputSchema, true, executeEmployeeUpdateForCaller, 'Employee update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of employeeWriteTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('employees:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['employees:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: employeeWriteText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: employeeWriteError(err, fallback) }],
            };
          }
        },
      );
    }
    const pointsDraftTools = [
      ['campaigns_prepare_points_draft', 'Prepare points draft', CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION, campaignsPreparePointsDraftInputSchema, campaignsPreparePointsDraftOutputSchema, false, preparePointsDraftForCaller, 'Campaign draft preview failed.'],
      ['campaigns_execute_points_draft', 'Save points draft', CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION, campaignsExecutePointsDraftInputSchema, campaignsExecutePointsDraftOutputSchema, true, executePointsDraftForCaller, 'Campaign draft save failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of pointsDraftTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('campaigns:draft'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:draft'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: pointsDraftText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: pointsDraftError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopWriteTools = [
      ['shops_prepare_create', 'Prepare store create', SHOPS_PREPARE_CREATE_DESCRIPTION, shopsPrepareCreateInputSchema, shopsPrepareCreateOutputSchema, false, prepareShopCreateForCaller, 'Store create preview failed.'],
      ['shops_execute_create', 'Create store', SHOPS_EXECUTE_CREATE_DESCRIPTION, shopsExecuteCreateInputSchema, shopsExecuteCreateOutputSchema, true, executeShopCreateForCaller, 'Store create failed.'],
      ['shops_prepare_update', 'Prepare store update', SHOPS_PREPARE_UPDATE_DESCRIPTION, shopsPrepareUpdateInputSchema, shopsPrepareUpdateOutputSchema, false, prepareShopUpdateForCaller, 'Store update preview failed.'],
      ['shops_execute_update', 'Update store', SHOPS_EXECUTE_UPDATE_DESCRIPTION, shopsExecuteUpdateInputSchema, shopsExecuteUpdateOutputSchema, true, executeShopUpdateForCaller, 'Store update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of shopWriteTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopWriteText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopWriteError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopCatalogTools = [
      ['shops_prepare_catalog_update', 'Prepare store products', SHOPS_PREPARE_CATALOG_DESCRIPTION, shopsPrepareCatalogInputSchema, shopsPrepareCatalogOutputSchema, false, prepareShopCatalogUpdateForCaller, 'Store product preview failed.'],
      ['shops_execute_catalog_update', 'Update store products', SHOPS_EXECUTE_CATALOG_DESCRIPTION, shopsExecuteCatalogInputSchema, shopsExecuteCatalogOutputSchema, true, executeShopCatalogUpdateForCaller, 'Store product update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of shopCatalogTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:catalog'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:catalog'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopCatalogText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopCatalogError(err, fallback) }],
            };
          }
        },
      );
    }
    const budgetTools = [
      ['budget_prepare_allocation', 'Prepare budget allocation', BUDGET_PREPARE_DESCRIPTION, budgetPrepareInputSchema, budgetPrepareOutputSchema, false, prepareBudgetAllocationForCaller, 'Budget preview failed.'],
      ['budget_execute_allocation', 'Allocate department budget', BUDGET_EXECUTE_DESCRIPTION, budgetExecuteInputSchema, budgetExecuteOutputSchema, true, executeBudgetAllocationForCaller, 'Budget allocation failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of budgetTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('wallets:allocate'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['wallets:allocate'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: budgetText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: budgetError(err, fallback) }],
            };
          }
        },
      );
    }
    const campaignSendTools = [
      ['campaigns_prepare_credit_allocation', 'Prepare reward credits', CREDIT_PREPARE_DESCRIPTION, creditPrepareInputSchema, creditPrepareOutputSchema, false, prepareCreditAllocationForCaller, 'Credit preview failed.'],
      ['campaigns_execute_credit_allocation', 'Allocate reward credits', CREDIT_EXECUTE_DESCRIPTION, creditExecuteInputSchema, creditExecuteOutputSchema, true, executeCreditAllocationForCaller, 'Credit allocation failed.'],
      ['campaigns_prepare_launch', 'Prepare campaign launch', LAUNCH_PREPARE_DESCRIPTION, launchPrepareInputSchema, launchPrepareOutputSchema, false, prepareLaunchForCaller, 'Launch preview failed.'],
      ['campaigns_execute_launch', 'Launch campaign', LAUNCH_EXECUTE_DESCRIPTION, launchExecuteInputSchema, launchExecuteOutputSchema, true, executeLaunchForCaller, 'Campaign launch failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of campaignSendTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('campaigns:send'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:send'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: campaignSendText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: campaignSendError(err, fallback) }],
            };
          }
        },
      );
    }
    const merchandiseTools = [
      ['campaigns_prepare_merchandise_draft', 'Prepare kit campaign', MERCHANDISE_PREPARE_DRAFT_DESCRIPTION, merchandisePrepareDraftInputSchema, merchandisePrepareDraftOutputSchema, false, prepareMerchandiseDraftForCaller, 'Kit preview failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_execute_merchandise_draft', 'Save kit campaign', MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION, merchandiseExecuteDraftInputSchema, merchandiseExecuteDraftOutputSchema, true, executeMerchandiseDraftForCaller, 'Kit save failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_prepare_merchandise_launch', 'Prepare kit launch', MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION, merchandisePrepareLaunchInputSchema, merchandisePrepareLaunchOutputSchema, false, prepareMerchandiseLaunchForCaller, 'Kit launch preview failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_execute_merchandise_launch', 'Launch kit campaign', MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION, merchandiseExecuteLaunchInputSchema, merchandiseExecuteLaunchOutputSchema, true, executeMerchandiseLaunchForCaller, 'Kit launch failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['shops_prepare_collection_draft', 'Prepare collection draft', COLLECTION_PREPARE_DRAFT_DESCRIPTION, collectionPrepareDraftInputSchema, collectionPrepareDraftOutputSchema, false, collectionPrepareDraftForCaller, 'Collection preview failed.', 'shops:publish', collectionText, collectionError],
      ['shops_execute_collection_draft', 'Save collection draft', COLLECTION_EXECUTE_DRAFT_DESCRIPTION, collectionExecuteDraftInputSchema, collectionExecuteDraftOutputSchema, true, collectionExecuteDraftForCaller, 'Collection save failed.', 'shops:publish', collectionText, collectionError],
      ['shops_prepare_collection_publish', 'Prepare collection publish', COLLECTION_PREPARE_PUBLISH_DESCRIPTION, collectionPreparePublishInputSchema, collectionPreparePublishOutputSchema, false, collectionPreparePublishForCaller, 'Publish preview failed.', 'shops:publish', collectionText, collectionError],
      ['shops_execute_collection_publish', 'Publish collection', COLLECTION_EXECUTE_PUBLISH_DESCRIPTION, collectionExecutePublishInputSchema, collectionExecutePublishOutputSchema, true, collectionExecutePublishForCaller, 'Collection publish failed.', 'shops:publish', collectionText, collectionError],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, scope, textFor, errorFor] of merchandiseTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes(scope),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: [scope] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: errorFor(err, fallback) }],
            };
          }
        },
      );
    }
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