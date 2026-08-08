import { ImageResponse } from "next/og";

export const alt = "FinalFrame design review and approval workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#050505", color: "#f4f4f5", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, color: "#34d399", fontSize: 34, fontWeight: 800 }}>
        <div style={{ width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#34d399", color: "#050505", fontSize: 38 }}>F</div>
        FinalFrame
      </div>
      <div style={{ marginTop: 48, maxWidth: 980, fontSize: 72, lineHeight: 1.05, letterSpacing: "-0.04em", fontWeight: 850 }}>
        Move creative work from feedback to final approval.
      </div>
      <div style={{ marginTop: 30, maxWidth: 900, color: "#a1a1aa", fontSize: 28, lineHeight: 1.4 }}>
        Versioned assets, precise comments, realtime collaboration and accountable client decisions in one workspace.
      </div>
    </div>,
    size,
  );
}
