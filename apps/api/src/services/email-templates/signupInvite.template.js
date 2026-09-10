import {
  appUrl,
  callout,
  ctaButton,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  signOff,
  strong,
} from './emailLayout.js';

function firstNameFrom(fullName = '') {
  const first = String(fullName).trim().split(/\s+/)[0];
  return first || '';
}

/** Sales / platform invite to create a company account on the allowlisted email. */
export function buildSignupInviteEmail({
  fullName = '',
  companyName = '',
  email = '',
  link = '',
} = {}) {
  const subject = "You're invited to create your ShelfMerch account";
  const firstName = firstNameFrom(fullName);
  const signupLink = link || appUrl('/signup');
  const safeCompany = companyName || 'your company';

  const text = [
    firstName ? `Hello ${firstName},` : 'Hello,',
    '',
    'ShelfMerch has approved your work email for signup.',
    `Create your ${safeCompany} account with the link below.`,
    '',
    `Create account: ${signupLink}`,
    email ? `Use this email: ${email}` : '',
    '',
    "Didn't expect this invite? You can safely ignore this email.",
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = [
    greeting(firstName),
    paragraph(
      `ShelfMerch has approved your work email. Create your ${strong(safeCompany)} account to get started.`,
    ),
    ctaButton('Create your account', signupLink),
    detailRows([
      { label: 'Company', value: companyName || '-' },
      { label: 'Email', value: email || '-' },
    ]),
    email
      ? callout('', `Sign up with ${strong(email)} - the address we allowlisted for you.`)
      : '',
    paragraph(
      '<span style="color:#8A8A8A;">Didn&rsquo;t expect this invite? You can safely ignore this email.</span>',
    ),
    signOff(),
  ].join('\n');

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Access',
    heroTitle: 'Create your account',
    preheader: 'Your email is approved - create your ShelfMerch company account.',
    bodyHtml,
  });

  return { subject, text, html };
}