import { ImageResponse } from "next/og";

// Shared look for Open Graph images (the previews WhatsApp, X and Facebook show)
export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({ kicker, title, footer }: { kicker: string; title: string; footer: string }) {
  const size = title.length > 90 ? 52 : title.length > 50 ? 64 : 76;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0d0e10", color: "#e8e9eb", padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "#ff4500", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 38, fontWeight: 800 }}>#</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>THREADIT</div>
          <div style={{ marginLeft: "auto", fontSize: 28, color: "#46d39a", fontWeight: 700 }}>{kicker}</div>
        </div>
        <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1.5, display: "flex" }}>{title.slice(0, 160)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: "#9aa0ab" }}>
          <span>{footer}</span>
          <div style={{ display: "flex", height: 10, width: 220 }}>
            <div style={{ flex: 1, background: "#0b8a5a" }} />
            <div style={{ flex: 1, background: "#ffffff" }} />
            <div style={{ flex: 1, background: "#0b8a5a" }} />
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
