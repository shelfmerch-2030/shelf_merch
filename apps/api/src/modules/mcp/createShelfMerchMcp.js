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