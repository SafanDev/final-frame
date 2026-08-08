"use client";

import { useReportWebVitals } from "next/web-vitals";
import { reportWebVital } from "@/lib/observability/client";

export default function WebVitalsReporter() {
  useReportWebVitals(reportWebVital);
  return null;
}
