/**
 * Standalone OpenAI Responses API image-search proof of concept.
 * Does NOT modify production Copilot image enrichment (OG/meta scrape).
 *
 * Usage (from apps/api):
 *   node scripts/openai-image-search-poc.mjs
 *
 * Requires OPENAI_API_KEY in the environment or apps/api/.env / repo .env.
 * Never logs the API key. Records latency and rough tool_usage when present.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(apiDir, '.env'));
loadEnvFile(resolve(root, '.env'));

const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.OPENAI_IMAGE_SEARCH_POC_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function collectImageResults(output = []) {
  const images = [];
  for (const item of output) {
    if (item?.type !== 'web_search_call') continue;
    const results = item.results || item.action?.results || [];
    for (const row of results) {
      if (row?.type && row.type !== 'image_result' && !row.image_url) continue;
      const imageUrl = row.image_url || row.url;
      const sourceUrl = row.source_website_url || row.source_url || row.page_url;
      if (!imageUrl || !isHttpUrl(imageUrl)) continue;
      images.push({
        imageUrl,
        thumbnailUrl: row.thumbnail_url && isHttpUrl(row.thumbnail_url) ? row.thumbnail_url : null,
        caption: typeof row.caption === 'string' ? row.caption.slice(0, 240) : null,
        sourceWebsiteUrl: sourceUrl && isHttpUrl(sourceUrl) ? sourceUrl : null,
        kind: 'illustrative_web_image',
      });
    }
  }
  return images;
}

async function main() {
  if (!apiKey) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      reason: 'OPENAI_API_KEY not set',
      sdkNote: 'Installed openai package supports Responses web_search / web_search_preview. Image results use search_content_types including image (documented; may need @ts-expect-error on older typings).',
    }, null, 2));
    process.exit(0);
  }

  const client = new OpenAI({ apiKey });
  const started = Date.now();
  const tools = [
    {
      type: 'web_search',
      search_content_types: ['image', 'text'],
      image_settings: { max_results: 3, caption: true },
      user_location: { type: 'approximate', country: 'IN' },
    },
  ];

  let response;
  let mode = 'web_search+image_settings';
  try {
    response = await client.responses.create({
      model,
      input: 'Find illustrative example images of premium employee welcome gift kits. Prefer product photography with source pages.',
      tools,
      include: ['web_search_call.results'],
      tool_choice: 'auto',
    });
  } catch (error) {
    // Fall back to legacy preview tool shape if current tool rejects undocumented fields.
    mode = 'web_search_preview+search_content_types';
    try {
      response = await client.responses.create({
        model,
        input: 'Find illustrative example images of premium employee welcome gift kits with source pages.',
        tools: [{ type: 'web_search_preview', search_content_types: ['image', 'text'], search_context_size: 'medium' }],
        include: ['web_search_call.results'],
        tool_choice: 'auto',
      });
    } catch (fallbackError) {
      console.log(JSON.stringify({
        ok: false,
        mode,
        latencyMs: Date.now() - started,
        error: {
          name: fallbackError?.name,
          status: fallbackError?.status,
          message: String(fallbackError?.message || fallbackError).slice(0, 400),
          primaryMessage: String(error?.message || error).slice(0, 400),
        },
        note: 'Do not integrate production Copilot until a supported request shape succeeds for this account/model.',
      }, null, 2));
      process.exit(1);
    }
  }

  const images = collectImageResults(response.output || []);
  const usage = response.usage || {};
  const toolUsage = response.usage?.tool_usage || response.tool_usage || {};
  console.log(JSON.stringify({
    ok: true,
    mode,
    model,
    latencyMs: Date.now() - started,
    imageCount: images.length,
    images: images.slice(0, 5),
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      webSearchRequests: toolUsage?.web_search?.num_requests,
    },
    distinction: 'These are illustrative web images with source attribution, not verified merchant listing photos.',
  }, null, 2));
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: String(error?.message || error).slice(0, 400) }, null, 2));
  process.exit(1);
});