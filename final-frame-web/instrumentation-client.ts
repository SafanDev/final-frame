import { reportClientError } from "./lib/observability/client";

try {
  performance.mark("finalframe-app-init");

  window.addEventListener("error", (event) => {
    const message = event.error ?? event.message;
    if (typeof message === "string" && /ResizeObserver loop/i.test(message)) return;
    reportClientError(message, { source: "window-error" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, { source: "unhandled-rejection" });
  });
} catch {
  // Instrumentation failures must never prevent the application from becoming interactive.
}

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  try {
    performance.mark(`finalframe-navigation-${navigationType}-${url.slice(0, 120)}`);
  } catch {
    // Performance marks are optional diagnostics.
  }
}
