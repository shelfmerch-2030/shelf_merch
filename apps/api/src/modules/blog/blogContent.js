import { ApiError } from '../../utils/errors.js';

const BLOCK_TYPES = new Set(['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote']);
const LEAF_TYPES = new Set(['text', 'hardBreak', 'horizontalRule', 'image']);
const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'link']);

export function safeLink(href) {
  if (typeof href !== 'string' || href.length > 2000 || href !== href.trim() || /[\\\u0000-\u001f]/.test(href)) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

/** Whitelist editor JSON on input; HTML from a client is never accepted. */
export function validateBlogContent(content) {
  let nodes = 0;
  const imageUrls = new Set();
  function visit(node, depth = 0) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 16 || ++nodes > 3000) {
      throw new ApiError(422, 'Invalid blog content', 'INVALID_BLOG_CONTENT');
    }
    if (!BLOCK_TYPES.has(node.type) && !LEAF_TYPES.has(node.type)) {
      throw new ApiError(422, 'Unsupported blog content', 'INVALID_BLOG_CONTENT');
    }
    if (node.type === 'text' && (typeof node.text !== 'string' || node.text.length > 20000)) {
      throw new ApiError(422, 'Invalid blog text', 'INVALID_BLOG_CONTENT');
    }
    if (node.type === 'heading' && ![2, 3].includes(node.attrs?.level)) {
      throw new ApiError(422, 'Only H2 and H3 headings are supported', 'INVALID_BLOG_CONTENT');
    }
    if (node.type === 'image') {
      if (typeof node.attrs?.src !== 'string' || !node.attrs.src ||
          typeof node.attrs?.alt !== 'string' || !node.attrs.alt.trim()) {
        throw new ApiError(422, 'Images need a source and alt text', 'INVALID_BLOG_CONTENT');
      }
      imageUrls.add(node.attrs.src);
    }
    if (node.marks !== undefined) {
      if (node.type !== 'text' || !Array.isArray(node.marks)) {
        throw new ApiError(422, 'Invalid text formatting', 'INVALID_BLOG_CONTENT');
      }
      for (const mark of node.marks) {
        if (!mark || !MARK_TYPES.has(mark.type) ||
            (mark.type === 'link' && !safeLink(mark.attrs?.href))) {
          throw new ApiError(422, 'Invalid blog link or formatting', 'INVALID_BLOG_CONTENT');
        }
      }
    }
    if (node.content !== undefined) {
      if (!BLOCK_TYPES.has(node.type) || !Array.isArray(node.content)) {
        throw new ApiError(422, 'Invalid blog content structure', 'INVALID_BLOG_CONTENT');
      }
      node.content.forEach((child) => visit(child, depth + 1));
    }
  }
  if (content?.type !== 'doc' || !Array.isArray(content.content)) {
    throw new ApiError(422, 'Blog content must be an editor document', 'INVALID_BLOG_CONTENT');
  }
  visit(content);
  return [...imageUrls];
}

export function blogPlainText(content) {
  const parts = [];
  function visit(node) {
    if (node.type === 'text') parts.push(node.text);
    for (const child of node.content ?? []) visit(child);
  }
  visit(content);
  return parts.join(' ').trim();
}

export function renderBlogContent(content) {
  function render(node) {
    const inner = (node.content ?? []).map(render).join('');
    switch (node.type) {
      case 'doc': return inner;
      case 'paragraph': return `<p>${inner}</p>`;
      case 'heading': return `<h${node.attrs.level}>${inner}</h${node.attrs.level}>`;
      case 'bulletList': return `<ul>${inner}</ul>`;
      case 'orderedList': return `<ol>${inner}</ol>`;
      case 'listItem': return `<li>${inner}</li>`;
      case 'blockquote': return `<blockquote>${inner}</blockquote>`;
      case 'horizontalRule': return '<hr />';
      case 'hardBreak': return '<br />';
      case 'image': return `<figure><img src="${escapeHtml(node.attrs.src)}" alt="${escapeHtml(node.attrs.alt)}" loading="lazy" /></figure>`;
      case 'text': {
        let html = escapeHtml(node.text);
        for (const mark of node.marks ?? []) {
          if (mark.type === 'bold') html = `<strong>${html}</strong>`;
          if (mark.type === 'italic') html = `<em>${html}</em>`;
          if (mark.type === 'strike') html = `<s>${html}</s>`;
          if (mark.type === 'link') html = `<a href="${escapeHtml(mark.attrs.href)}" rel="noopener noreferrer">${html}</a>`;
        }
        return html;
      }
      default: return '';
    }
  }
  return render(content);
}
