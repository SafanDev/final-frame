import { z } from "zod";

const publicUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use HTTP or HTTPS.")
  .transform((value) => value.replace(/\/$/, ""));


const publicOrigin = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new TypeError("Unsupported protocol.");
      }
      if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
        throw new TypeError("Expected an origin without credentials, path, query, or fragment.");
      }
      return url.origin;
    } catch {
      context.addIssue({
        code: "custom",
        message: "Storage origin must be an HTTP or HTTPS origin without credentials, path, query, or fragment.",
      });
      return z.NEVER;
    }
  });

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const booleanText = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SITE_URL: publicUrl,
  NEXT_PUBLIC_API_URL: publicUrl,
  NEXT_PUBLIC_STORAGE_ORIGIN: publicOrigin,
  NEXT_PUBLIC_SITE_NAME: z.string().trim().min(2).max(80).default("FinalFrame"),
  NEXT_PUBLIC_RELEASE_VERSION: z.string().trim().min(1).max(120).default("local"),
  NEXT_PUBLIC_TELEMETRY_ENABLED: booleanText,
  NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: optionalText,
  NEXT_PUBLIC_BING_SITE_VERIFICATION: optionalText,
});

const parsed = publicEnvironmentSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_STORAGE_ORIGIN: process.env.NEXT_PUBLIC_STORAGE_ORIGIN,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_RELEASE_VERSION: process.env.NEXT_PUBLIC_RELEASE_VERSION,
  NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
  NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  NEXT_PUBLIC_BING_SITE_VERIFICATION:
    process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid public web environment: ${details}`);
}

export const clientEnv = Object.freeze(parsed.data);
