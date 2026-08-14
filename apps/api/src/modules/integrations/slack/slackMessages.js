import { appUrl } from '../../../services/email.service.js';

export function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function pushField(fields, label, value) {
  if (value == null || value === '') return;
  fields.push({ type: 'mrkdwn', text: `*${label}*\n${value}` });
}

/**
 * Shared Block Kit builder.
 */
export function buildSlackBusinessMessage({
  emojiTitle,
  headline,
  fields = [],
  linkPath = null,
  linkLabel = 'View in ShelfMerch',
}) {
  const link = linkPath ? appUrl(linkPath) : null;
  const lineFields = [];
  for (const f of fields) {
    if (f?.value == null || f.value === '') continue;
    lineFields.push(`• ${f.label}: ${f.value}`);
  }

  const textParts = [`${emojiTitle}\n\n${headline}`];
  if (lineFields.length) textParts.push(lineFields.join('\n'));
  if (link) textParts.push(`\n${linkLabel}:\n${link}`);
  const text = textParts.join('\n');

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: emojiTitle.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headline },
    },
  ];

  const kitFields = [];
  for (const f of fields) {
    pushField(kitFields, f.label, f.value);
  }
  if (kitFields.length) {
    blocks.push({ type: 'section', fields: kitFields.slice(0, 10) });
  }
  if (link) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${link}|${linkLabel}>` },
    });
  }

  return { text, blocks };
}

export function deliveryFailureLabel(status, note) {
  const map = {
    delayed: 'Delivery delayed',
    rto: 'Return to origin',
    lost: 'Shipment marked lost',
    damaged: 'Shipment marked damaged',
  };
  const base = map[status] || 'Delivery needs attention';
  const extra = typeof note === 'string' ? note.trim() : '';
  if (extra && extra.length <= 120) return `${base}: ${extra}`;
  return base;
}