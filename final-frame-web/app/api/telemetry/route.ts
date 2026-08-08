import { NextResponse, type NextRequest } from "next/server";
import { clientTelemetrySchema } from "@/lib/observability/schemas";
import { recordClientTelemetry } from "@/lib/observability/server";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin telemetry is not accepted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > serverEnv.TELEMETRY_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Telemetry payload is too large." }, { status: 413 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Telemetry payload could not be read." }, { status: 400 });
  }

  if (Buffer.byteLength(body, "utf8") > serverEnv.TELEMETRY_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Telemetry payload is too large." }, { status: 413 });
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Telemetry payload is not valid JSON." }, { status: 400 });
  }

  const parsed = clientTelemetrySchema.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json({ error: "Telemetry payload is invalid." }, { status: 400 });
  }

  await recordClientTelemetry(parsed.data);
  return new NextResponse(null, {
    status: 202,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
