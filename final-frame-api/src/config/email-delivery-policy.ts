export type RequestedEmailDeliveryMode = 'auto' | 'resend' | 'disabled';
export type ResolvedEmailDeliveryMode = Exclude<RequestedEmailDeliveryMode, 'auto'>;

export function resolveEmailDeliveryMode(
  requestedMode: RequestedEmailDeliveryMode,
  apiKey?: string,
  fromAddress?: string,
): ResolvedEmailDeliveryMode {
  if (requestedMode !== 'auto') return requestedMode;
  return apiKey && fromAddress ? 'resend' : 'disabled';
}

export function shouldRequireEmailVerification(
  requested: boolean,
  deliveryMode: ResolvedEmailDeliveryMode,
): boolean {
  return requested && deliveryMode === 'resend';
}
