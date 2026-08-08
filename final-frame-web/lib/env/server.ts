import { z } from "zod";
import { clientEnv } from "./client";

const serverUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use HTTP or HTTPS.")
  .transform((value) => value.replace(/\/$/, ""));

const optionalServerUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(serverUrl.optional());

const optionalSecret = z
  .string()
  .trim()
  .max(2_000)
  .optional()
  .transform((value) => value || undefined);

const booleanText = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const placeholderPattern = /replace|example|your_|changeme|placeholder|\.\.\./i;

function isPrivateServiceUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || !hostname.includes(".")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".local");
}

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOYMENT_ENVIRONMENT: z
      .enum(["development", "staging", "production"])
      .default("development"),
    API_URL: serverUrl,
    NEXTAUTH_URL: serverUrl,
    NEXTAUTH_SECRET: z
      .string()
      .min(32, "NEXTAUTH_SECRET must contain at least 32 characters."),
    SESSION_COOKIE_NAME: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/),
    RELEASE_VERSION: z.string().trim().min(1).max(120).default("local"),
    OBSERVABILITY_ENDPOINT: optionalServerUrl,
    OBSERVABILITY_TOKEN: optionalSecret,
    OBSERVABILITY_LOG_TO_STDOUT: booleanText,
    TELEMETRY_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(65_536)
      .default(16_384),
    HSTS_SCOPE: z.enum(["host", "include-subdomains", "preload"]).default("host"),
    HSTS_MAX_AGE_SECONDS: z.coerce.number().int().min(86_400).max(63_072_000).default(15_552_000),
    HSTS_DOMAIN_CONTROL_CONFIRMED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  })
  .superRefine((value, context) => {
    const nextAuthUrl = new URL(value.NEXTAUTH_URL);
    const publicSiteUrl = new URL(clientEnv.NEXT_PUBLIC_SITE_URL);
    const publicApiUrl = new URL(clientEnv.NEXT_PUBLIC_API_URL);
    const privateApiUrl = new URL(value.API_URL);
    const storageOrigin = new URL(clientEnv.NEXT_PUBLIC_STORAGE_ORIGIN);

    if (nextAuthUrl.origin !== publicSiteUrl.origin) {
      context.addIssue({
        code: "custom",
        path: ["NEXTAUTH_URL"],
        message: "NEXTAUTH_URL must match NEXT_PUBLIC_SITE_URL.",
      });
    }

    if (value.DEPLOYMENT_ENVIRONMENT === "production") {
      if (value.HSTS_SCOPE !== "host" && (!value.HSTS_DOMAIN_CONTROL_CONFIRMED || value.HSTS_MAX_AGE_SECONDS < 31_536_000)) {
        context.addIssue({
          code: "custom",
          path: ["HSTS_SCOPE"],
          message: "HSTS subdomain/preload scope requires domain-control confirmation and at least one year of max-age.",
        });
      }
      const publicApiPath = publicApiUrl.pathname.replace(/\/$/, "");
      if (publicApiUrl.origin !== publicSiteUrl.origin || publicApiPath !== "/backend") {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_API_URL"],
          message: "Production browser API traffic must use NEXT_PUBLIC_SITE_URL with the /backend path.",
        });
      }
      if (publicApiUrl.search || publicApiUrl.hash) {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_API_URL"],
          message: "NEXT_PUBLIC_API_URL must not contain a query string or fragment.",
        });
      }

      if (storageOrigin.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_STORAGE_ORIGIN"],
          message: "Production storage origins must use HTTPS.",
        });
      }
    }

    if (value.RELEASE_VERSION !== clientEnv.NEXT_PUBLIC_RELEASE_VERSION) {
      context.addIssue({
        code: "custom",
        path: ["RELEASE_VERSION"],
        message:
          "RELEASE_VERSION must match NEXT_PUBLIC_RELEASE_VERSION so client and server telemetry share one release identifier.",
      });
    }

    if (value.DEPLOYMENT_ENVIRONMENT === "production") {
      for (const [path, url] of [
        ["NEXTAUTH_URL", nextAuthUrl],
        ["NEXT_PUBLIC_SITE_URL", publicSiteUrl],
        ["NEXT_PUBLIC_API_URL", publicApiUrl],
        ["API_URL", privateApiUrl],
      ] as const) {
        const privateHttpApi = path === "API_URL" && url.protocol === "http:" && isPrivateServiceUrl(url);
        if (url.protocol !== "https:" && !privateHttpApi) {
          context.addIssue({
            code: "custom",
            path: [path],
            message: `${path} must use HTTPS, except API_URL may use HTTP for a private service hostname.`,
          });
        }
      }

      if (!value.SESSION_COOKIE_NAME.startsWith("__Secure-")) {
        context.addIssue({
          code: "custom",
          path: ["SESSION_COOKIE_NAME"],
          message: "Production session cookies must use the __Secure- prefix.",
        });
      }

      if (placeholderPattern.test(value.NEXTAUTH_SECRET)) {
        context.addIssue({
          code: "custom",
          path: ["NEXTAUTH_SECRET"],
          message: "NEXTAUTH_SECRET must not contain a placeholder value in production.",
        });
      }

      if (value.RELEASE_VERSION === "local" || placeholderPattern.test(value.RELEASE_VERSION)) {
        context.addIssue({
          code: "custom",
          path: ["RELEASE_VERSION"],
          message:
            "Production deployments must use a unique release identifier such as a Git commit SHA.",
        });
      }
    }
  });

const parsed = serverEnvironmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT,
  API_URL: process.env.API_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
  RELEASE_VERSION: process.env.RELEASE_VERSION,
  OBSERVABILITY_ENDPOINT: process.env.OBSERVABILITY_ENDPOINT,
  OBSERVABILITY_TOKEN: process.env.OBSERVABILITY_TOKEN,
  OBSERVABILITY_LOG_TO_STDOUT: process.env.OBSERVABILITY_LOG_TO_STDOUT,
  TELEMETRY_MAX_BODY_BYTES: process.env.TELEMETRY_MAX_BODY_BYTES,
  HSTS_SCOPE: process.env.HSTS_SCOPE,
  HSTS_MAX_AGE_SECONDS: process.env.HSTS_MAX_AGE_SECONDS,
  HSTS_DOMAIN_CONTROL_CONFIRMED: process.env.HSTS_DOMAIN_CONTROL_CONFIRMED,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid private web environment: ${details}`);
}

export const serverEnv = Object.freeze(parsed.data);
export const isNodeProduction = serverEnv.NODE_ENV === "production";
export const isProduction = serverEnv.DEPLOYMENT_ENVIRONMENT === "production";
export const useSecureCookies = new URL(serverEnv.NEXTAUTH_URL).protocol === "https:";
