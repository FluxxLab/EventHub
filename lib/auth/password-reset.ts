import { z } from 'zod';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';

/** The reset code the API emails: six digits. */
export const resetSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(255, 'Keep it under 255 characters.'),
});

/** Seconds before another code can be asked for, so a double tap does not send two emails. */
export const RESEND_AFTER_S = 30;

/**
 * Step 1: email a code. The API answers the same whether or not the address has an account, so
 * nobody can use this form to find out who is on the team.
 */
export async function requestResetCode(email: string): Promise<void> {
  if (DEMO_MODE) return new Promise((r) => setTimeout(r, 400));
  await api.postPublic('/auth/forgot-password', { email: email.trim().toLowerCase() });
}

/** Step 2: the code and the new password. Every existing session of the account is signed out. */
export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 400));
    if (otp !== '123456') throw new Error('That code is wrong or has expired. Check the email, or send a new code.');
    return;
  }
  await api.postPublic('/auth/reset-password', { email: email.trim().toLowerCase(), otp: otp.trim(), newPassword });
}
