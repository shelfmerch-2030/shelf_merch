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

function buildManagerEmailBody({
  name,
  email,
  departmentName,
  organizationName,
  roleTitle,
  link,
  ctaLabel,
  inviteAction = true,
}) {
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const actionCopy = inviteAction
    ? 'Accept the invitation below to set your password. You can then sign in with this email and manage your department merch budget and campaigns.'
    : 'Sign in with your existing ShelfMerch account to manage your department merch budget and campaigns.';

  return `
    ${greeting(name)}
    ${paragraph(
      `${strong(safeOrg)} added you as ${strong(safeRole)} for the ${strong(safeDept)} team. ${actionCopy}`,
    )}
    ${ctaButton(ctaLabel, link)}
    ${detailRows([
      { label: 'Organization', value: organizationName },
      { label: 'Department', value: departmentName },
      { label: 'Role', value: roleTitle },
    ])}
    ${email ? callout('', `We sent this invite to ${strong(email)}.`) : ''}
    ${paragraph(
      `<span style="color:#8A8A8A;">Didn&rsquo;t expect this invite? You can safely ignore this email.</span>`,
    )}
    ${signOff()}`;
}

export function buildManagerInviteEmail({
  name = '',
  email = '',
  departmentName = '',
  organizationName = 'your organization',
  roleTitle = 'Department Manager',
  link = '',
}) {
  const fullLink = link || '';
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const subject = `Your ShelfMerch invite from ${safeOrg}`;

  const bodyHtml = buildManagerEmailBody({
    name,
    email,
    departmentName,
    organizationName,
    roleTitle,
    link: fullLink,
    ctaLabel: 'Accept invitation',
    inviteAction: true,
  });

  const text = [
    `Your ShelfMerch invite from ${safeOrg}`,
    '',
    name ? `Hello ${name},` : 'Hello,',
    '',
    `${safeOrg} added you as ${safeRole} for the ${safeDept} team.`,
    'Accept the invitation below to set your password, then sign in with this email.',
    '',
    `Accept invitation: ${fullLink}`,
    '',
    `Organization: ${organizationName}`,
    `Department: ${departmentName || 'Not set'}`,
    `Role: ${roleTitle}`,
    email ? `We sent this invite to: ${email}` : '',
    '',
    "Didn't expect this invite? You can safely ignore this email.",
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    html: emailShell({
      title: subject,
      heroEyebrow: 'ShelfMerch Team',
      heroTitle: "You're invited to ShelfMerch",
      preheader: `${safeOrg} invited you to join as ${safeRole}`,
      bodyHtml,
    }),
    text,
  };
}

export function buildManagerAssignmentEmail({
  name = '',
  email = '',
  departmentName = '',
  organizationName = 'your organization',
  roleTitle = 'Department Manager',
  link = '',
}) {
  const fullLink = link || appUrl('/login');
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const subject = `Your ShelfMerch invite from ${safeOrg}`;

  const bodyHtml = buildManagerEmailBody({
    name,
    email,
    departmentName,
    organizationName,
    roleTitle,
    link: fullLink,
    ctaLabel: 'Sign in to ShelfMerch',
    inviteAction: false,
  });

  const text = [
    `Your ShelfMerch invite from ${safeOrg}`,
    '',
    name ? `Hello ${name},` : 'Hello,',
    '',
    `${safeOrg} added you as ${safeRole} for the ${safeDept} team.`,
    '',
    `Sign in: ${fullLink}`,
  ].join('\n');

  return {
    subject,
    html: emailShell({
      title: subject,
      heroEyebrow: 'ShelfMerch Team',
      heroTitle: "You're on the team",
      preheader: `You're set up as ${safeRole} for ${departmentName || 'your department'} at ${safeOrg}`,
      bodyHtml,
    }),
    text,
  };
}
