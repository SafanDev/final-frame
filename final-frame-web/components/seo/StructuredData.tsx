import { headers } from "next/headers";

interface StructuredDataProps {
  data: Record<string, unknown> | readonly Record<string, unknown>[];
}

export default async function StructuredData({ data }: StructuredDataProps) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
