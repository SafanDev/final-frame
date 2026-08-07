import type { Instrumentation } from "next";
import { recordServerError } from "@/lib/observability/server";

export function register() {
  console.info(
    JSON.stringify({
      level: "info",
      message: "FinalFrame web process started",
      service: "final-frame-web",
      environment: process.env.DEPLOYMENT_ENVIRONMENT || "development",
      release: process.env.RELEASE_VERSION || "local",
      runtime: process.env.NEXT_RUNTIME || "nodejs",
      timestamp: new Date().toISOString(),
    }),
  );
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await recordServerError({
    error,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    runtime: process.env.NEXT_RUNTIME || "nodejs",
  });
};
