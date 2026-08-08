export const REGISTRATION_NEXT_STEP = Object.freeze({
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  SIGN_IN: 'SIGN_IN',
} as const);

export type RegistrationNextStep = typeof REGISTRATION_NEXT_STEP[keyof typeof REGISTRATION_NEXT_STEP];

export interface RegistrationAcceptedResponse {
  message: string;
  accepted: true;
  nextStep: RegistrationNextStep;
}

/**
 * Registration never reveals whether the submitted address was newly created,
 * already active, awaiting verification, suspended, or previously deleted.
 * The next step is based only on deployment policy, not account existence.
 */
export function buildRegistrationAcceptedResponse(
  requireEmailVerification: boolean,
): RegistrationAcceptedResponse {
  return requireEmailVerification
    ? {
        message: 'Continue from your inbox, or sign in if you already have an account.',
        accepted: true,
        nextStep: REGISTRATION_NEXT_STEP.VERIFY_EMAIL,
      }
    : {
        message: 'Continue by signing in.',
        accepted: true,
        nextStep: REGISTRATION_NEXT_STEP.SIGN_IN,
      };
}
