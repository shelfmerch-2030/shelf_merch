import { z } from 'zod';

/**
 * §security hardening B2 — shared credential policy for set-password flows
 * (register, invite acceptance). Login itself keeps min(1) so existing
 * accounts can still authenticate.
 */
export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'Password must include at least one letter and one number',
  });

/**
 * Reset-password checklist. Min 8 + upper + lower + number + special.
 * Kept separate from register strongPassword so signup policy stays unchanged.
 */
export const resetPasswordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => /[A-Z]/.test(v), { message: 'Password must include an uppercase letter' })
  .refine((v) => /[a-z]/.test(v), { message: 'Password must include a lowercase letter' })
  .refine((v) => /\d/.test(v), { message: 'Password must include a number' })
  .refine((v) => /[^A-Za-z0-9]/.test(v), {
    message: 'Password must include a special character',
  });

/** Format-only — allowlist policy is enforced in auth.service. */
const authEmail = z.string().email();

export const loginSchema = z.object({
  email: authEmail,
  password: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(1),
  email: authEmail,
  password: strongPassword,
  companyName: z.string().min(1),
});

export const refreshSchema = z.preprocess(
  (value) => (value == null ? {} : value),
  z.object({
    refreshToken: z.string().min(1).optional(),
  }),
);

export const logoutSchema = z.preprocess(
  (value) => (value == null ? {} : value),
  z.object({
    refreshToken: z.string().optional(),
    everywhere: z.boolean().optional().default(false),
  }),
);

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: resetPasswordPolicy,
});

export const validateResetTokenSchema = z.object({
  token: z.string().min(1),
});

/** Email/password signup start (OTP) — same credential rules as register. */
export const startSignupSchema = registerSchema;

export const resendSignupOtpSchema = z.object({
  pendingId: z.string().uuid(),
});

export const verifySignupOtpSchema = z.object({
  pendingId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});
