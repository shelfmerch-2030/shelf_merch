import {
  emailShell,
  greeting,
  paragraph,
  signOff,
} from './emailLayout.js';

function firstNameFrom(fullName = '') {
  const first = String(fullName).trim().split(/\s+/)[0];
  return first || '';
}

export function buildDemoRequestConfirmationEmail({
  fullName = '',
  companyName = '',
  workEmail = '',
  mobileNumber = '',
  requirement = '',
} = {}) {
  void companyName;
  void workEmail;
  void mobileNumber;
  void requirement;

  const subject = "We've received your ShelfMerch demo request";
  const firstName = firstNameFrom(fullName);

  const text = [
    firstName ? `Hello ${firstName},` : 'Hello,',
    '',
    'Thanks for your interest in ShelfMerch.',
    'Your demo request has been submitted successfully.',
    'Our team will contact you within 1 business day.',
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ].join('\n');

  const bodyHtml = `
    ${greeting(firstName)}
    ${paragraph(
      'Thanks for your interest in ShelfMerch. Your demo request has been submitted successfully.',
    )}
    ${paragraph(
      'Our team will contact you within <strong style="color:#1F1F1F;font-weight:700;">1 business day</strong>.',
    )}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Demo',
    heroTitle: "We've received your request",
    preheader: 'Your demo request was submitted successfully. We will contact you within 1 business day.',
    bodyHtml,
  });

  return { subject, text, html };
}