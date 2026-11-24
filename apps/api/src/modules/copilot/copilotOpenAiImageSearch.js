import { env } from '../../config/env.js';
import { createOpenAiClient } from './providers/openaiChatAdapter.js';

/**
 * Optional illustrative image discovery via OpenAI Responses web_search.
 * Distinct from merchant OG/meta enrichment — never presented as verified listing photos.
 * Default off via EMBEDDED_COPILOT_OPENAI_IMAGE_SEARCH_ENABLED.
 */
export function openAiImageSearchEnabled() {
  return env.EMBEDDED_COPILOT_OPENAI_IMAGE_SEARCH_ENABLED === 'true'
    && Boolean(env.OPENAI_API_KEY);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function collectImages(output = []) {
  const images = [];
  for (const item of output) {
    if (item?.type !== 'web_search_call') continue;
    const results = item.results || item.action?.results || [];
    for (const row of results) {
      const imageUrl = row.image_url || row.url;
      if (!imageUrl || !isHttpUrl(imageUrl)) continue;
      if (row.type && row.type !== 'image_result' && !row.image_url) continue;
      const sourceWebsiteUrl = row.source_website_url || row.source_url || null;
      images.push({
        kind: 'illustrative_web_image',
        imageUrl,
        thumbnailUrl: row.thumbnail_url && isHttpUrl(row.thumbnail_url) ? row.thumbnail_url : undefined,
        caption: typeof row.caption === 'string' ? row.caption.slice(0, 240) : undefined,
        sourceWebsiteUrl: sourceWebsiteUrl && isHttpUrl(sourceWebsiteUrl) ? sourceWebsiteUrl : undefined,
      });
    }
  }
  return images.slice(0, env.EMBEDDED_COPILOT_OPENAI_IMAGE_SEARCH_MAX || 4);
}

export async function searchIllustrativeImages(query, { signal } = {}) {
  if (!openAiImageSearchEnabled()) {
    return { status: 'disabled', images: [], diagnostics: { skipReason: 'flag_off_or_missing_key' } };
  }
  const started = Date.now();
  const client = createOpenAiClient();
  if (!client) {
    return { status: 'disabled', images: [], diagnostics: { skipReason: 'missing_openai_client' } };
  }
  const model = env.EMBEDDED_COPILOT_OPENAI_IMAGE_SEARCH_MODEL || env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = String(query || '').slice(0, 240);
  if (prompt.length < 8) {
    return { status: 'skipped', images: [], diagnostics: { skipReason: 'query_too_short' } };
  }
  try {
    let response;
    try {
      response = await client.responses.create({
        model,
        input: `Find illustrative example images for: ${prompt}. Prefer clear product photography with source pages.`,
        tools: [{
          type: 'web_search',
          search_content_types: ['image', 'text'],
          image_settings: { max_results: env.EMBEDDED_COPILOT_OPENAI_IMAGE_SEARCH_MAX || 4, caption: true },
        }],
        include: ['web_search_call.results'],
        tool_choice: 'auto',
      }, { signal });
    } catch {
      response = await client.responses.create({
        model,
        input: `Find illustrative example images for: ${prompt}.`,
        tools: [{ type: 'web_search_preview', search_content_types: ['image', 'text'] }],
        include: ['web_search_call.results'],
        tool_choice: 'auto',
      }, { signal });
    }
    const images = collectImages(response.output || []);
    return {
      status: images.length ? 'completed' : 'no_results',
      images,
      diagnostics: {
        latencyMs: Date.now() - started,
        model,
        webSearchRequests: response.usage?.tool_usage?.web_search?.num_requests,
      },
    };
  } catch (error) {
    return {
      status: 'unavailable',
      images: [],
      diagnostics: {
        latencyMs: Date.now() - started,
        errorName: error?.name || 'Error',
        status: error?.status,
      },
    };
  }
}