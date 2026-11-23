import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';

export function createAnthropicClient({ apiKey = env.ANTHROPIC_API_KEY } = {}) {
  const key = apiKey?.trim();
  if (!key) return null;
  return new Anthropic({
    apiKey: key,
    defaultHeaders: env.ANTHROPIC_API_VERSION
      ? { 'anthropic-version': env.ANTHROPIC_API_VERSION }
      : undefined,
  });
}

/** Never log raw SDK errors: provider messages can echo request/customer data. */
export function anthropicErrorDetails(err) {
  const detail = err?.error?.error || err?.error;
  const message = detail?.message;
  // This validation error contains only a tool index and provider documentation.
  const schemaError = typeof message === 'string' && /^tools\.\d+\.(?:custom\.)?input_schema: JSON schema is invalid\. It must match JSON Schema draft 2020-12 \(https:\/\/json-schema\.org\/draft\/2020-12\)\. Learn more about tool use at https:\/\/platform\.claude\.com\/docs\/en\/agents-and-tools\/tool-use\/overview\.$/.test(message);
  const requestId = err?.requestID || err?.headers?.get?.('request-id') || err?.request_id;
  return {
    type: /^[a-z_]+_error$/.test(detail?.type || '') ? detail.type : undefined,
    message: schemaError ? message : '[Provider message omitted to protect request data]',
    param: typeof detail?.param === 'string' && /^(?:tools|messages)\.\d+(?:\.[a-z_]+)*$/.test(detail.param) ? detail.param : null,
    requestId: /^req_[a-zA-Z0-9]+$/.test(requestId || '') ? requestId : undefined,
  };
}

/**
 * Convert JSON Schema / OpenAPI 3.0 draft-04 constructs into JSON Schema Draft 2020-12
 * as required by Anthropic Messages API tool definitions.
 */
export function normalizeJsonSchemaDraft2020(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(normalizeJsonSchemaDraft2020);

  const copy = { ...schema };

  // Draft 2020-12 requires numeric exclusiveMinimum / exclusiveMaximum, not boolean.
  if (typeof copy.exclusiveMinimum === 'boolean') {
    if (copy.exclusiveMinimum && typeof copy.minimum === 'number') {
      copy.exclusiveMinimum = copy.minimum;
      delete copy.minimum;
    } else {
      delete copy.exclusiveMinimum;
    }
  }
  if (typeof copy.exclusiveMaximum === 'boolean') {
    if (copy.exclusiveMaximum && typeof copy.maximum === 'number') {
      copy.exclusiveMaximum = copy.maximum;
      delete copy.maximum;
    } else {
      delete copy.exclusiveMaximum;
    }
  }

  if (copy.properties && typeof copy.properties === 'object') {
    const props = {};
    for (const [key, value] of Object.entries(copy.properties)) {
      props[key] = normalizeJsonSchemaDraft2020(value);
    }
    copy.properties = props;
  }

  if (copy.items) {
    copy.items = normalizeJsonSchemaDraft2020(copy.items);
  }

  if (copy.prefixItems && Array.isArray(copy.prefixItems)) {
    copy.prefixItems = copy.prefixItems.map(normalizeJsonSchemaDraft2020);
  }

  if (copy.additionalProperties && typeof copy.additionalProperties === 'object') {
    copy.additionalProperties = normalizeJsonSchemaDraft2020(copy.additionalProperties);
  }

  if (copy.patternProperties && typeof copy.patternProperties === 'object') {
    const patProps = {};
    for (const [key, value] of Object.entries(copy.patternProperties)) {
      patProps[key] = normalizeJsonSchemaDraft2020(value);
    }
    copy.patternProperties = patProps;
  }

  if (Array.isArray(copy.allOf)) copy.allOf = copy.allOf.map(normalizeJsonSchemaDraft2020);
  if (Array.isArray(copy.anyOf)) copy.anyOf = copy.anyOf.map(normalizeJsonSchemaDraft2020);
  if (Array.isArray(copy.oneOf)) copy.oneOf = copy.oneOf.map(normalizeJsonSchemaDraft2020);
  if (copy.not && typeof copy.not === 'object') copy.not = normalizeJsonSchemaDraft2020(copy.not);

  return copy;
}

/** Convert OpenAI-shaped Copilot tools to Anthropic tool definitions. */
export function toAnthropicTools(openAiTools = []) {
  return openAiTools.map((tool) => {
    const fn = tool.function || tool;
    const schema = fn.parameters && typeof fn.parameters === 'object'
      ? fn.parameters
      : { type: 'object', properties: {} };
    const normalized = normalizeJsonSchemaDraft2020(schema);
    const input_schema = {
      type: normalized.type || 'object',
      properties: normalized.properties || {},
      ...(Array.isArray(normalized.required) ? { required: normalized.required } : {}),
      ...(normalized.additionalProperties !== undefined
        ? { additionalProperties: normalized.additionalProperties }
        : {}),
    };
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema,
    };
  });
}

function parseArgsObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Convert persisted ShelfMerch conversation messages into Anthropic Messages API turns.
 * System prompt is passed separately as top-level `system`.
 */
export function toAnthropicMessages(messages = []) {
  const out = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === 'system') {
      i += 1;
      continue;
    }
    if (m.role === 'user') {
      out.push({
        role: 'user',
        content: Array.isArray(m.content) ? m.content : (m.content || ''),
      });
      i += 1;
      continue;
    }
    if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls || []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: parseArgsObject(call.arguments),
        });
      }
      if (!content.length) content.push({ type: 'text', text: '' });
      out.push({ role: 'assistant', content });
      i += 1;
      continue;
    }
    if (m.role === 'tool') {
      const results = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const toolMsg = messages[i];
        results.push({
          type: 'tool_result',
          tool_use_id: toolMsg.toolCallId,
          content: toolMsg.content || '',
        });
        i += 1;
      }
      out.push({ role: 'user', content: results });
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Stream one Claude Messages completion.
 * Does not auto-run tools — returns tool_use for ShelfMerch orchestration.
 */
export async function streamAnthropicCompletion({
  client,
  model = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  systemPrompt,
  messages,
  tools,
  webSearch,
  signal,
  onTextDelta,
}) {
  const anthropicTools = toAnthropicTools(tools || []);
  if (webSearch) anthropicTools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: webSearch.maxUses });
  const stream = client.messages.stream(
    {
      model,
      max_tokens: env.EMBEDDED_COPILOT_MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages,
      ...(anthropicTools.length ? { tools: anthropicTools } : {}),
    },
    webSearch ? { signal, maxRetries: 0 } : signal ? { signal } : undefined,
  );

  let text = '';
  const toolBlocksByIndex = new Map();
  let stopReason = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let webSearchRequests = 0;
  let contentBlocks;

  try {
    for await (const event of stream) {
      if (signal?.aborted) {
        try {
          stream.abort?.();
        } catch {
          /* ignore */
        }
        const err = new Error('Request aborted');
        err.code = 'ABORT_ERR';
        throw err;
      }

      if (event.type === 'message_start' && event.message?.usage) {
        promptTokens += event.message.usage.input_tokens || 0;
        webSearchRequests = Math.max(webSearchRequests, event.message.usage.server_tool_use?.web_search_requests || 0);
      }
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          toolBlocksByIndex.set(event.index, {
            id: block.id,
            name: block.name,
            argumentsJson: '',
          });
        }
      }
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          text += delta.text;
          onTextDelta?.(delta.text);
        }
        if (delta?.type === 'input_json_delta' && delta.partial_json != null) {
          const current = toolBlocksByIndex.get(event.index);
          if (current) current.argumentsJson += delta.partial_json;
        }
      }
      if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage?.output_tokens != null) completionTokens = event.usage.output_tokens;
        if (event.usage?.input_tokens != null) {
          promptTokens = Math.max(promptTokens, event.usage.input_tokens);
        }
        webSearchRequests = Math.max(webSearchRequests, event.usage?.server_tool_use?.web_search_requests || 0);
      }
    }
  } catch (error) {
    if (!webSearch) throw error;
    return { text: '', toolCalls: [], usage: { promptTokens, completionTokens }, webSearchRequests, finishReason: null };
  }

  let toolCalls = [...toolBlocksByIndex.values()]
    .filter((row) => row?.id && row?.name)
    .map((row) => ({
      id: row.id,
      name: row.name,
      arguments: row.argumentsJson || '{}',
    }));

  try {
    const finalMessage = await stream.finalMessage();
    if (finalMessage?.usage) {
      promptTokens = finalMessage.usage.input_tokens || promptTokens;
      completionTokens = finalMessage.usage.output_tokens || completionTokens;
      webSearchRequests = Math.max(webSearchRequests, finalMessage.usage.server_tool_use?.web_search_requests || 0);
    }
    if (finalMessage?.stop_reason) stopReason = finalMessage.stop_reason;
    if (Array.isArray(finalMessage?.content)) {
      if (webSearch) contentBlocks = finalMessage.content;
      const fromFinal = [];
      let finalText = '';
      for (const block of finalMessage.content) {
        if (block.type === 'text' && block.text) finalText += block.text;
        if (block.type === 'tool_use') {
          fromFinal.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          });
        }
      }
      if (fromFinal.length) toolCalls = fromFinal;
      if (finalText && !text) text = finalText;
    }
  } catch {
    /* keep streamed partials */
  }

  return {
    text,
    toolCalls,
    usage: { promptTokens, completionTokens },
    finishReason: stopReason,
    ...(webSearch ? { contentBlocks, webSearchRequests } : {}),
  };
}

export function appendAnthropicAssistantToolTurn(messages, { text, toolCalls }) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  for (const call of toolCalls) {
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: parseArgsObject(call.arguments),
    });
  }
  messages.push({
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
  });
}

export function appendAnthropicToolResults(messages, results) {
  messages.push({
    role: 'user',
    content: results.map((row) => ({
      type: 'tool_result',
      tool_use_id: row.toolCallId,
      content: row.content,
      ...(row.isError ? { is_error: true } : {}),
    })),
  });
}
