import type { AssetCategory } from "@/lib/assets/file-policy";

export default function AssetFileIcon({ category }: { category: AssetCategory }) {
  const className = "h-4 w-4";
  const common = { fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" } as const;

  if (category === "image") {
    return <svg className={className} {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m4 16 4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /></svg>;
  }
  if (category === "video") {
    return <svg className={className} {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m15 10 4.6-2.3A1 1 0 0 1 21 8.6v6.8a1 1 0 0 1-1.4.9L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" /></svg>;
  }
  if (category === "code") {
    return <svg className={className} {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m10 20 4-16m4 4 4 4-4 4M6 16l-4-4 4-4" /></svg>;
  }
  return <svg className={className} {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 .3.7V19a2 2 0 0 1-2 2Z" /></svg>;
}
