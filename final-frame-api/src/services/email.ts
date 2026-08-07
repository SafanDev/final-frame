import { Resend } from 'resend';
import { z } from 'zod';
import { emailDeliveryMode, env } from '../config/env.js';
import { ExternalServiceError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

const emailAddressSchema = z.string().trim().email().max(254);
const subjectSchema = z.string().trim().min(1).max(200).refine(
  (subject) => !/[\r\n]/u.test(subject),
  'Email subjects cannot contain line breaks.',
);
const htmlReplacements: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
});
const resend = emailDeliveryMode === 'resend' && env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface EmailDeliveryReceipt { id: string }
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/gu, (character) => htmlReplacements[character] ?? character);

function assertFrontendUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.origin !== new URL(env.FRONTEND_URL).origin) {
    throw new Error('Email action URLs must use the configured frontend origin.');
  }
  return parsed;
}

const sendEmail = async (to: string, subject: string, html: string): Promise<EmailDeliveryReceipt> => {
  const validatedTo = emailAddressSchema.parse(to);
  const validatedSubject = subjectSchema.parse(subject);
  if (!resend || !env.EMAIL_FROM_ADDRESS) {
    throw new ExternalServiceError('Email delivery is disabled.');
  }
  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM_ADDRESS,
      to: validatedTo,
      subject: validatedSubject,
      html,
    });
    if (result.error || !result.data?.id) throw new Error(result.error?.message ?? 'The email provider returned no message ID.');
    return { id: result.data.id };
  } catch (error) {
    logger.error('Email delivery failed', { toEmail: validatedTo, subject: validatedSubject, error });
    throw new ExternalServiceError('Unable to deliver email.', error);
  }
};

function actionEmail(title: string, body: string, actionLabel: string, actionUrl: string): string {
  const safeTitle = escapeHtml(title.slice(0, 120));
  const safeBody = escapeHtml(body.slice(0, 600));
  const safeLabel = escapeHtml(actionLabel.slice(0, 60));
  const safeUrl = escapeHtml(assertFrontendUrl(actionUrl).toString());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#08090a;color:#fff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#08090a"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;padding:32px;border:1px solid #2a2d30;border-radius:18px;background:#111315"><tr><td><p style="margin:0 0 12px;color:#6ee7b7;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">FinalFrame</p><h1 style="margin:0 0 16px;font-size:25px;line-height:1.25">${safeTitle}</h1><p style="margin:0 0 24px;color:#b0b4b8;font-size:15px;line-height:1.65">${safeBody}</p><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#6ee7b7;color:#06251a;text-decoration:none;font-size:14px;font-weight:800">${safeLabel}</a><p style="margin:28px 0 0;color:#73777c;font-size:12px;line-height:1.5">If you did not expect this message, no action is required.</p></td></tr></table></td></tr></table></body></html>`;
}

export const sendProjectInvitation = (input: { to: string; projectTitle: string; inviteUrl: string }) =>
  sendEmail(
    input.to,
    `Review ${input.projectTitle.slice(0, 100)} in FinalFrame`,
    actionEmail(
      `You were invited to ${input.projectTitle}`,
      'Review the invitation details and accept access using the account that received this email.',
      'Review invitation',
      input.inviteUrl,
    ),
  );

export const sendEmailVerification = (input: { to: string; verificationUrl: string }) =>
  sendEmail(
    input.to,
    'Verify your FinalFrame email',
    actionEmail('Verify your email', 'Confirm this email address before signing in to FinalFrame.', 'Verify email', input.verificationUrl),
  );

export const sendPasswordReset = (input: { to: string; resetUrl: string }) =>
  sendEmail(
    input.to,
    'Reset your FinalFrame password',
    actionEmail('Reset your password', 'This link expires soon and can be used only once.', 'Reset password', input.resetUrl),
  );

export interface NotificationEmailItem {
  title: string;
  body: string;
  href?: string | null;
}

export const sendNotificationEmail = (input: {
  to: string;
  items: readonly NotificationEmailItem[];
  digest: boolean;
}) => {
  const items = input.items.slice(0, 20);
  const lead = items.at(0);
  if (!lead) throw new Error('Notification email requires at least one item.');
  const title = input.digest ? 'Your FinalFrame notification digest' : lead.title;
  const body = input.digest
    ? items.slice(0, 8).map((item) => `${item.title}: ${item.body}`).join(' \u2022 ')
    : lead.body;
  const href = !input.digest && lead.href?.startsWith('/') ? lead.href : '/notifications';
  const actionUrl = new URL(href, env.FRONTEND_URL).toString();
  return sendEmail(
    input.to,
    input.digest ? 'Your FinalFrame notification digest' : lead.title.slice(0, 200),
    actionEmail(title, body, input.digest ? 'Open notifications' : 'Review update', actionUrl),
  );
};
