function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minimal demo-request confirmation email matching the success mock:
 * envelope graphic + short success headline + 1 business day follow-up.
 */
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const OUTER_BG = '#F4F6FA';
const CARD = '#FFFFFF';
const PRIMARY = '#3155FF';
const TITLE = '#121212';
const BODY = '#6B7280';
const MUTED = '#9CA3AF';
const BORDER = '#E6E8EE';

function firstNameFrom(fullName = '') {
  const first = String(fullName).trim().split(/\s+/)[0];
  return first || 'there';
}

function successGraphic(successCid) {
  if (successCid) {
    return `<img src="cid:${escapeHtml(successCid)}" alt="Request submitted successfully" width="180" style="display:block;margin:0 auto;width:180px;max-width:55%;height:auto;border:0;" />`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
    <tr>
      <td align="center" style="width:88px;height:88px;border-radius:50%;background:${PRIMARY};color:#FFFFFF;font-family:${SANS};font-size:42px;font-weight:700;line-height:88px;">&#10003;</td>
    </tr>
  </table>`;
}

export function buildDemoRequestConfirmationEmail({
  fullName = '',
  successCid = '',
} = {}) {
  const subject = "We've received your Shelf Merch demo request";
  const firstName = firstNameFrom(fullName);

  const text = [
    `Hi ${firstName},`,
    '',
    'Your request has been submitted successfully.',
    'Our team will contact you within 1 business day.',
    '',
    'Team Shelf Merch',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${OUTER_BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    Your request has been submitted successfully. Our team will contact you within 1 business day.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${OUTER_BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520"><tr><td>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;width:100%;background:${CARD};border:1px solid ${BORDER};border-radius:24px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:48px 36px 20px 36px;">
              ${successGraphic(successCid)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 36px 0 36px;font-family:${SANS};font-size:28px;font-weight:800;line-height:1.3;letter-spacing:-0.03em;color:${TITLE};">
              Your request has been submitted <span style="color:${PRIMARY};">successfully.</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 36px 48px 36px;font-family:${SANS};font-size:16px;line-height:1.55;color:${BODY};">
              Our team will contact you within <strong style="color:${TITLE};font-weight:700;">1 business day.</strong>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;width:100%;">
          <tr>
            <td align="center" style="padding:20px 16px 0 16px;font-family:${SANS};">
              <p style="margin:0 0 2px 0;font-size:13px;font-weight:700;color:${TITLE};">Shelf Merch</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">Corporate Swag Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}