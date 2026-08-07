import { z } from "zod";

const routePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^\//, "Route paths must be relative and begin with a slash.");

const commonSchema = z.object({
  eventId: z.string().uuid(),
  route: routePathSchema,
  release: z.string().trim().min(1).max(120),
  timestamp: z.string().datetime({ offset: true }),
});

export const webVitalTelemetrySchema = commonSchema.extend({
  type: z.literal("web-vital"),
  metricId: z.string().trim().min(1).max(200),
  name: z.enum([
    "TTFB",
    "FCP",
    "LCP",
    "FID",
    "CLS",
    "INP",
    "Next.js-hydration",
    "Next.js-route-change-to-render",
    "Next.js-render",
  ]),
  value: z.number().finite().nonnegative(),
  delta: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  navigationType: z.string().trim().max(80).optional(),
});

export const clientErrorTelemetrySchema = commonSchema.extend({
  type: z.literal("client-error"),
  message: z.string().trim().min(1).max(500),
  source: z.enum([
    "window-error",
    "unhandled-rejection",
    "react-boundary",
    "global-boundary",
    "manual",
  ]),
  digest: z.string().trim().max(200).optional(),
  fatal: z.boolean().default(false),
});

export const clientTelemetrySchema = z.discriminatedUnion("type", [
  webVitalTelemetrySchema,
  clientErrorTelemetrySchema,
]);

export type ClientTelemetryEvent = z.infer<typeof clientTelemetrySchema>;
export type WebVitalTelemetryEvent = z.infer<typeof webVitalTelemetrySchema>;
export type ClientErrorTelemetryEvent = z.infer<typeof clientErrorTelemetrySchema>;
