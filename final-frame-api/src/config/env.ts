import 'dotenv/config';
import { z } from 'zod';
import { resolveEmailDeliveryMode, shouldRequireEmailVerification } from './email-delivery-policy.ts';

const integerFromEnvironment = (fallback: number, minimum: number, maximum: number) =>
  z.preprocess(
    (raw) => {
      if (raw === undefined || raw === '') return fallback;
      if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return Number.NaN;
      return Number(raw);
    },
    z.number().int().min(minimum).max(maximum),
  );

const booleanFromEnvironment = (fallback: boolean) =>
  z.preprocess(
    (raw) => raw === undefined || raw === '' ? String(fallback) : raw,
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  );

const optionalNonEmptyString = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === '' ? undefined : raw),
  z.string().trim().min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: integerFromEnvironment(5000, 1, 65_535),
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    FRONTEND_URL: z.string().url(),
    TRUST_PROXY_HOPS: integerFromEnvironment(0, 0, 16),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    HTTP_SLOW_REQUEST_MS: integerFromEnvironment(2_000, 100, 120_000),
    SHUTDOWN_TIMEOUT_MS: integerFromEnvironment(75_000, 5_000, 300_000),
    API_JSON_BODY_LIMIT_BYTES: integerFromEnvironment(1_048_576, 1_024, 10 * 1024 * 1024),
    HTTP_REQUEST_TIMEOUT_MS: integerFromEnvironment(65_000, 5_000, 300_000),
    HTTP_HEADERS_TIMEOUT_MS: integerFromEnvironment(15_000, 1_000, 60_000),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: integerFromEnvironment(5_000, 1_000, 60_000),
    HTTP_MAX_REQUESTS_PER_SOCKET: integerFromEnvironment(1_000, 1, 100_000),
    READINESS_TIMEOUT_MS: integerFromEnvironment(2_000, 250, 10_000),
    BCRYPT_ROUNDS: integerFromEnvironment(12, 10, 15),
    PAGE_DEFAULT_SIZE: integerFromEnvironment(50, 1, 100),
    PAGE_MAX_SIZE: integerFromEnvironment(100, 1, 250),
    INVITE_TTL_HOURS: integerFromEnvironment(168, 1, 720),
    REQUIRE_EMAIL_VERIFICATION: booleanFromEnvironment(true),
    EMAIL_VERIFICATION_TTL_HOURS: integerFromEnvironment(24, 1, 168),
    PASSWORD_RESET_TTL_MINUTES: integerFromEnvironment(30, 5, 120),
    MFA_SETUP_TTL_MINUTES: integerFromEnvironment(10, 5, 60),
    MFA_ISSUER: z.string().trim().min(2).max(80).default('FinalFrame'),
    MFA_ENCRYPTION_KEY: z.string().trim().min(32),
    MFA_RECOVERY_PEPPER: z.string().trim().min(32),
    UPLOAD_RESERVATION_TTL_MINUTES: integerFromEnvironment(15, 5, 60),
    MULTIPART_UPLOAD_THRESHOLD_BYTES: integerFromEnvironment(8 * 1024 * 1024, 5 * 1024 * 1024, 5 * 1024 * 1024 * 1024),
    MULTIPART_UPLOAD_PART_SIZE_BYTES: integerFromEnvironment(8 * 1024 * 1024, 5 * 1024 * 1024, 512 * 1024 * 1024),

    DATABASE_URL: z.string().trim().min(1),
    DIRECT_DATABASE_URL: optionalNonEmptyString,
    DB_MAX_CONNECTIONS: integerFromEnvironment(10, 1, 100),
    DB_CONNECTION_TIMEOUT_MS: integerFromEnvironment(5_000, 500, 30_000),
    DB_IDLE_TIMEOUT_MS: integerFromEnvironment(300_000, 1_000, 900_000),
    DB_QUERY_TIMEOUT_MS: integerFromEnvironment(30_000, 1_000, 120_000),
    DB_STATEMENT_TIMEOUT_MS: integerFromEnvironment(30_000, 1_000, 120_000),

    REDIS_URL: optionalNonEmptyString,
    REDIS_REQUIRED: booleanFromEnvironment(false),
    REDIS_CONNECT_TIMEOUT_MS: integerFromEnvironment(5_000, 500, 30_000),
    REDIS_READINESS_TIMEOUT_MS: integerFromEnvironment(1_500, 250, 10_000),
    REDIS_KEY_PREFIX: z.string().trim().min(2).max(64).default('finalframe:'),

    NEXTAUTH_SECRET: z.string().min(32),
    SESSION_COOKIE_NAME: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/),

    R2_ACCOUNT_ID: z.string().trim().min(1),
    R2_ACCESS_KEY_ID: z.string().trim().min(1),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
    R2_BUCKET_NAME: z.string().trim().min(3).max(63),
    R2_ENDPOINT: optionalNonEmptyString.pipe(z.string().url().optional()),
    R2_REGION: z.string().trim().min(1).max(64).default('auto'),
    R2_FORCE_PATH_STYLE: booleanFromEnvironment(true),
    R2_PUBLIC_URL: optionalNonEmptyString.pipe(z.string().url().optional()),
    R2_UPLOAD_URL_TTL_SECONDS: integerFromEnvironment(600, 60, 3_600),
    R2_VIEW_URL_TTL_SECONDS: integerFromEnvironment(900, 60, 28_800),
    MAX_ASSET_UPLOAD_BYTES: integerFromEnvironment(100 * 1024 * 1024, 1, 2_147_483_647),
    MAX_AUDIO_UPLOAD_BYTES: integerFromEnvironment(10 * 1024 * 1024, 1, 100 * 1024 * 1024),
    ASSET_PROCESSING_INTERVAL_MS: integerFromEnvironment(5_000, 1_000, 300_000),
    ASSET_PROCESSING_BATCH_SIZE: integerFromEnvironment(2, 1, 10),
    ASSET_PROCESSING_TIMEOUT_MS: integerFromEnvironment(180_000, 10_000, 900_000),
    ASSET_PROCESSING_STALE_MS: integerFromEnvironment(600_000, 60_000, 3_600_000),
    ASSET_PREVIEW_MAX_TEXT_BYTES: integerFromEnvironment(2 * 1024 * 1024, 1_024, 20 * 1024 * 1024),
    ASSET_PREVIEW_MAX_BYTES: integerFromEnvironment(50 * 1024 * 1024, 1_024, 500 * 1024 * 1024),
    ASSET_IMAGE_MAX_PIXELS: integerFromEnvironment(50_000_000, 1_000_000, 500_000_000),
    ASSET_VIDEO_MAX_PIXELS: integerFromEnvironment(8_847_360, 230_400, 132_710_400),
    ASSET_VIDEO_MAX_DURATION_SECONDS: integerFromEnvironment(3_600, 1, 86_400),
    ASSET_PDF_MAX_PAGES: integerFromEnvironment(500, 1, 10_000),
    ASSET_FFMPEG_PATH: optionalNonEmptyString,
    ASSET_FFPROBE_PATH: optionalNonEmptyString,
    ASSET_PDFINFO_PATH: optionalNonEmptyString,
    ASSET_GHOSTSCRIPT_PATH: optionalNonEmptyString,
    CLAMAV_HOST: optionalNonEmptyString,
    CLAMAV_PORT: integerFromEnvironment(3310, 1, 65_535),
    CLAMAV_TIMEOUT_MS: integerFromEnvironment(120_000, 1_000, 600_000),

    EMAIL_DELIVERY_MODE: z.enum(['auto', 'resend', 'disabled']).default('auto'),
    RESEND_API_KEY: optionalNonEmptyString,
    EMAIL_FROM_ADDRESS: optionalNonEmptyString,
    EMAIL_OUTBOX_INTERVAL_MS: integerFromEnvironment(10_000, 1_000, 300_000),
    EMAIL_OUTBOX_BATCH_SIZE: integerFromEnvironment(20, 1, 100),

    OPENROUTER_API_KEY: optionalNonEmptyString,
    OPENROUTER_MODEL: z.string().trim().min(1).default('openrouter/free'),
    OPENROUTER_TIMEOUT_MS: integerFromEnvironment(25_000, 1_000, 60_000),
    OPENROUTER_MAX_INPUT_CHARS: integerFromEnvironment(12_000, 1_000, 50_000),
    OPENROUTER_MAX_OUTPUT_TOKENS: integerFromEnvironment(1_500, 100, 4_000),

    STORAGE_CLEANUP_INTERVAL_MS: integerFromEnvironment(30_000, 5_000, 300_000),
    STORAGE_CLEANUP_BATCH_SIZE: integerFromEnvironment(25, 1, 200),
    STORAGE_CLEANUP_LOCK_MS: integerFromEnvironment(300_000, 30_000, 3_600_000),
    STORAGE_CLEANUP_MAX_ATTEMPTS: integerFromEnvironment(10, 1, 50),
    STORAGE_CLEANUP_MAX_BATCHES_PER_RUN: integerFromEnvironment(4, 1, 50),
    PROJECT_DELETION_INTERVAL_MS: integerFromEnvironment(5_000, 1_000, 300_000),
    PROJECT_DELETION_BATCH_SIZE: integerFromEnvironment(10, 1, 100),
    RETENTION_CLEANUP_INTERVAL_MS: integerFromEnvironment(3_600_000, 60_000, 86_400_000),
    RETENTION_CLEANUP_BATCH_SIZE: integerFromEnvironment(100, 1, 1_000),
    NOTIFICATION_RETENTION_DAYS: integerFromEnvironment(180, 30, 3_650),
    TOKEN_RETENTION_DAYS: integerFromEnvironment(30, 1, 365),

    SESSION_REVALIDATION_INTERVAL_MS: integerFromEnvironment(60_000, 10_000, 300_000),

    FREE_MAX_PROJECTS: integerFromEnvironment(10, 1, 10_000),
    GLOBAL_MAX_PROJECTS: integerFromEnvironment(100, 1, 100_000),
    FREE_MAX_PROJECT_MEMBERS: integerFromEnvironment(10, 1, 1_000),
    FREE_MAX_PENDING_INVITES: integerFromEnvironment(25, 1, 10_000),
    FREE_MAX_COMMENTS_PER_PROJECT: integerFromEnvironment(5_000, 10, 1_000_000),
    FREE_MAX_STORAGE_BYTES: integerFromEnvironment(2 * 1024 * 1024 * 1024, 1_048_576, 10 * 1024 * 1024 * 1024 * 1024),
    GLOBAL_MAX_STORAGE_BYTES: integerFromEnvironment(8 * 1024 * 1024 * 1024, 1_048_576, 10 * 1024 * 1024 * 1024 * 1024),
    FREE_MAX_AI_REQUESTS_PER_MONTH: integerFromEnvironment(50, 0, 100_000),

    SOCKET_MAX_HTTP_BUFFER_BYTES: integerFromEnvironment(16_384, 1_024, 1_048_576),
    SOCKET_PING_INTERVAL_MS: integerFromEnvironment(25_000, 5_000, 120_000),
    SOCKET_PING_TIMEOUT_MS: integerFromEnvironment(20_000, 5_000, 120_000),
    SOCKET_AUTH_IP_ATTEMPTS_PER_MINUTE: integerFromEnvironment(300, 1, 10_000),
    SOCKET_AUTH_USER_ATTEMPTS_PER_MINUTE: integerFromEnvironment(60, 1, 10_000),
    SOCKET_MAX_CONNECTIONS_PER_IP: integerFromEnvironment(100, 1, 10_000),
    SOCKET_MAX_CONNECTIONS_PER_USER: integerFromEnvironment(10, 1, 1_000),
    SOCKET_JOIN_DEBOUNCE_MS: integerFromEnvironment(150, 0, 5_000),
    SOCKET_CURSOR_INTERVAL_MS: integerFromEnvironment(33, 10, 1_000),
    SOCKET_RECOVERY_MAX_DISCONNECTION_MS: integerFromEnvironment(120_000, 10_000, 900_000),
    SOCKET_CONNECTION_LEASE_TTL_MS: integerFromEnvironment(90_000, 30_000, 600_000),
    SOCKET_CONNECTION_LEASE_REFRESH_MS: integerFromEnvironment(30_000, 5_000, 300_000),

    METRICS_BEARER_TOKEN: z.preprocess(
      (raw) => (typeof raw === 'string' && raw.trim() === '' ? undefined : raw),
      z.string().trim().min(32).optional(),
    ),
    CERTIFICATE_SIGNING_KEY: z.string().trim().min(48),
    CERTIFICATE_KEY_ID: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,80}$/).default('finalframe-ed25519-v1'),
    CERTIFICATE_TRUSTED_PUBLIC_KEYS_JSON: z.string().trim().default('{}'),
    STORAGE_RECONCILIATION_MAX_OBJECTS: integerFromEnvironment(100_000, 100, 10_000_000),
    STORAGE_RECONCILIATION_ORPHAN_GRACE_HOURS: integerFromEnvironment(24, 1, 720),
  })
  .superRefine((value, context) => {
    const frontend = new URL(value.FRONTEND_URL);

    if (!['http:', 'https:'].includes(frontend.protocol)) {
      context.addIssue({
        code: 'custom',
        path: ['FRONTEND_URL'],
        message: 'FRONTEND_URL must use HTTP or HTTPS.',
      });
    }

    if (value.R2_ENDPOINT) {
      const endpoint = new URL(value.R2_ENDPOINT);
      if (
        !['http:', 'https:'].includes(endpoint.protocol)
        || endpoint.username
        || endpoint.password
        || endpoint.pathname !== '/'
        || endpoint.search
        || endpoint.hash
      ) {
        context.addIssue({
          code: 'custom',
          path: ['R2_ENDPOINT'],
          message: 'R2_ENDPOINT must be an HTTP or HTTPS origin without credentials, path, query, or fragment.',
        });
      }
    }

    if (value.NODE_ENV === 'production') {
      if (frontend.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['FRONTEND_URL'],
          message: 'FRONTEND_URL must use HTTPS in production.',
        });
      }

      if (!value.SESSION_COOKIE_NAME.startsWith('__Secure-')) {
        context.addIssue({
          code: 'custom',
          path: ['SESSION_COOKIE_NAME'],
          message: 'Production session cookies must use the __Secure- prefix.',
        });
      }

      if (!value.CLAMAV_HOST) {
        context.addIssue({ code: 'custom', path: ['CLAMAV_HOST'], message: 'CLAMAV_HOST is required in production.' });
      }

      if (value.R2_ENDPOINT && new URL(value.R2_ENDPOINT).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['R2_ENDPOINT'],
          message: 'A custom production storage endpoint must use HTTPS.',
        });
      }

      if (!value.REDIS_URL) {
        context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'REDIS_URL is required in production.' });
      }

      if (!value.REDIS_REQUIRED) {
        context.addIssue({ code: 'custom', path: ['REDIS_REQUIRED'], message: 'REDIS_REQUIRED must be true in production.' });
      }

      if (!value.METRICS_BEARER_TOKEN) {
        context.addIssue({ code: 'custom', path: ['METRICS_BEARER_TOKEN'], message: 'METRICS_BEARER_TOKEN is required in production.' });
      }

      const productionSecrets = [
        value.NEXTAUTH_SECRET,
        value.R2_ACCESS_KEY_ID,
        value.R2_SECRET_ACCESS_KEY,
        value.MFA_ENCRYPTION_KEY,
        value.MFA_RECOVERY_PEPPER,
        value.CERTIFICATE_SIGNING_KEY,
        value.METRICS_BEARER_TOKEN ?? '',
      ];

      if (productionSecrets.some((secret) => /replace|example|your_|changeme|\.\.\./i.test(secret))) {
        context.addIssue({
          code: 'custom',
          message: 'Production secrets must not contain placeholder values.',
        });
      }
    }

    const resolvedEmailMode = resolveEmailDeliveryMode(
      value.EMAIL_DELIVERY_MODE,
      value.RESEND_API_KEY,
      value.EMAIL_FROM_ADDRESS,
    );

    if (resolvedEmailMode === 'resend') {
      if (!value.RESEND_API_KEY) {
        context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required when email delivery uses Resend.' });
      }
      if (!value.EMAIL_FROM_ADDRESS) {
        context.addIssue({ code: 'custom', path: ['EMAIL_FROM_ADDRESS'], message: 'EMAIL_FROM_ADDRESS is required when email delivery uses Resend.' });
      }
    }

    if (value.SHUTDOWN_TIMEOUT_MS <= value.HTTP_REQUEST_TIMEOUT_MS) {
      context.addIssue({
        code: 'custom',
        path: ['SHUTDOWN_TIMEOUT_MS'],
        message: 'SHUTDOWN_TIMEOUT_MS must exceed HTTP_REQUEST_TIMEOUT_MS so accepted requests can drain.',
      });
    }

    if (value.HTTP_HEADERS_TIMEOUT_MS >= value.HTTP_REQUEST_TIMEOUT_MS) {
      context.addIssue({
        code: 'custom',
        path: ['HTTP_HEADERS_TIMEOUT_MS'],
        message: 'HTTP_HEADERS_TIMEOUT_MS must be lower than HTTP_REQUEST_TIMEOUT_MS.',
      });
    }

    if (value.PAGE_DEFAULT_SIZE > value.PAGE_MAX_SIZE) {
      context.addIssue({
        code: 'custom',
        path: ['PAGE_DEFAULT_SIZE'],
        message: 'PAGE_DEFAULT_SIZE cannot exceed PAGE_MAX_SIZE.',
      });
    }

    if (value.SOCKET_CONNECTION_LEASE_REFRESH_MS * 2 >= value.SOCKET_CONNECTION_LEASE_TTL_MS) {
      context.addIssue({
        code: 'custom',
        path: ['SOCKET_CONNECTION_LEASE_REFRESH_MS'],
        message: 'SOCKET_CONNECTION_LEASE_REFRESH_MS must be less than half of SOCKET_CONNECTION_LEASE_TTL_MS.',
      });
    }

    try {
      const trustedKeys = JSON.parse(value.CERTIFICATE_TRUSTED_PUBLIC_KEYS_JSON) as unknown;
      if (!trustedKeys || Array.isArray(trustedKeys) || typeof trustedKeys !== 'object') {
        throw new TypeError('Expected an object.');
      }
      for (const [keyId, publicKey] of Object.entries(trustedKeys as Record<string, unknown>)) {
        if (!/^[A-Za-z0-9._:-]{1,80}$/.test(keyId) || typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(publicKey)) {
          throw new TypeError('Expected key IDs mapped to Ed25519 base64url public keys.');
        }
      }
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['CERTIFICATE_TRUSTED_PUBLIC_KEYS_JSON'],
        message: 'CERTIFICATE_TRUSTED_PUBLIC_KEYS_JSON must be a JSON object of key IDs to Ed25519 public keys.',
      });
    }

    if (value.MAX_AUDIO_UPLOAD_BYTES > value.MAX_ASSET_UPLOAD_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['MAX_AUDIO_UPLOAD_BYTES'],
        message: 'MAX_AUDIO_UPLOAD_BYTES cannot exceed MAX_ASSET_UPLOAD_BYTES.',
      });
    }
  });

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';
// Auto mode keeps the app usable when no email provider is configured.
export const emailDeliveryMode = resolveEmailDeliveryMode(
  env.EMAIL_DELIVERY_MODE,
  env.RESEND_API_KEY,
  env.EMAIL_FROM_ADDRESS,
);
export const emailDeliveryEnabled = emailDeliveryMode !== 'disabled';
export const emailVerificationRequired = shouldRequireEmailVerification(
  env.REQUIRE_EMAIL_VERIFICATION,
  emailDeliveryMode,
);
export const frontendOrigin = new URL(env.FRONTEND_URL).origin;
