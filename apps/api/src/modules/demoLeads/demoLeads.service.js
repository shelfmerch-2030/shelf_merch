import { appUrl, sendSignupInviteEmail } from '../../services/email.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { User } from '../users/user.model.js';
import { appendEmailAllowlist, normalizeEmail } from '../auth/workEmail.js';
import { getSetting } from '../platform/platformSettings.service.js';
import { DemoLead } from './demoLead.model.js';

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildSignupInviteLink({ email, fullName = '', companyName = '' }) {
  const { firstName, lastName } = splitName(fullName);
  const params = new URLSearchParams();
  if (email) params.set('email', normalizeEmail(email));
  if (firstName) params.set('firstName', firstName);
  if (lastName) params.set('lastName', lastName);
  if (companyName) params.set('company', String(companyName).trim());
  const qs = params.toString();
  return appUrl(qs ? `/signup?${qs}` : '/signup');
}

/**
 * Allowlist an email and email a /signup CTA.
 * Optionally tied to a demo lead (updates invite timestamps + status).
 */
export async function inviteSignupAccess({
  req,
  leadId = null,
  email = '',
  fullName = '',
  companyName = '',
}) {
  const signupMode = await getSetting('signup.mode');
  if (signupMode === 'closed') {
    throw new ApiError(
      403,
      'Self-service signup is closed. Open signup in Platform Settings first.',
      'SIGNUP_CLOSED',
    );
  }

  let lead = null;
  if (leadId) {
    lead = await DemoLead.findById(leadId);
    if (!lead) throw new NotFoundError('Demo lead not found');
  }

  const normalizedEmail = normalizeEmail(lead?.workEmail || email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new ApiError(400, 'A valid email is required', 'INVALID_EMAIL');
  }

  const name = String(fullName || lead?.fullName || '').trim();
  const company = String(companyName || lead?.companyName || '').trim();

  const existingUser = await User.findOne({ email: normalizedEmail }).select('_id status');
  if (existingUser) {
    throw new ConflictError(
      'An account already exists for this email — ask them to sign in instead.',
    );
  }

  await appendEmailAllowlist([normalizedEmail], req?.user?.userId ?? null);

  const link = buildSignupInviteLink({
    email: normalizedEmail,
    fullName: name,
    companyName: company,
  });

  const mailed = await sendSignupInviteEmail({
    to: normalizedEmail,
    fullName: name,
    companyName: company,
    link,
  });

  if (!mailed?.success && mailed?.provider === 'smtp') {
    throw new ApiError(502, 'Could not send the signup invite email', 'EMAIL_SEND_FAILED');
  }

  if (lead) {
    const nextStatus = lead.status === 'new' ? 'contacted' : lead.status;
    lead.signupInviteSentAt = new Date();
    lead.signupInviteCount = (lead.signupInviteCount || 0) + 1;
    lead.status = nextStatus;
    await lead.save();
  } else {
    // If a matching open lead exists, stamp the invite on the newest one.
    const matched = await DemoLead.findOne({ workEmail: normalizedEmail }).sort({ createdAt: -1 });
    if (matched) {
      matched.signupInviteSentAt = new Date();
      matched.signupInviteCount = (matched.signupInviteCount || 0) + 1;
      if (matched.status === 'new') matched.status = 'contacted';
      await matched.save();
      lead = matched;
    }
  }

  writeAudit({
    req,
    action: 'sales.signup_invite',
    entityType: lead ? 'DemoLead' : 'User',
    entityId: lead?._id ?? null,
    after: {
      email: normalizedEmail,
      companyName: company || null,
      leadId: lead ? String(lead._id) : null,
      signupInviteCount: lead?.signupInviteCount ?? 1,
    },
  });

  return {
    email: normalizedEmail,
    allowlisted: true,
    inviteSent: true,
    signupUrl: link,
    lead: lead
      ? {
          id: String(lead._id),
          status: lead.status,
          signupInviteSentAt: lead.signupInviteSentAt,
          signupInviteCount: lead.signupInviteCount,
        }
      : null,
  };
}
