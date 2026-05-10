/**
 * GET /api/og?title=...&badge=...
 *
 * Dynamic Open Graph image generator using Next.js ImageResponse.
 * Returns a 1200x630 PNG branded for social sharing — drastically improves
 * social CTR vs a static dashboard screenshot.
 *
 * Usage in metadata:
 *   openGraph: {
 *     images: [`/api/og?title=${encodeURIComponent(blog.title)}`]
 *   }
 *
 * No external dependencies — uses Edge runtime + ImageResponse.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "Phelix ERP — FBR POS System Pakistan").slice(0, 140);
  const badge = (searchParams.get("badge") ?? "FBR Certified").slice(0, 40);
  const subtitle = (searchParams.get("subtitle") ?? "Pakistan's Senior FBR-Compliant POS").slice(0, 120);

  return new ImageResponse(
    (
      <div
        style={{
          width:           "100%",
          height:          "100%",
          display:         "flex",
          flexDirection:   "column",
          background:      "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #1A1D27 100%)",
          padding:         "70px",
          color:           "white",
          fontFamily:      "sans-serif",
          position:        "relative",
        }}
      >
        {/* Glow accent */}
        <div
          style={{
            position:       "absolute",
            top:            -150,
            right:          -150,
            width:          500,
            height:         500,
            borderRadius:   "50%",
            background:     "radial-gradient(circle, rgba(249, 115, 22, 0.25) 0%, transparent 70%)",
            display:        "flex",
          }}
        />

        {/* Top bar — brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 50 }}>
          <div
            style={{
              width:         54,
              height:        54,
              borderRadius:  14,
              background:    "linear-gradient(135deg, #F97316, #EA580C)",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              fontSize:      28,
              fontWeight:    900,
              color:         "white",
            }}
          >
            P
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Phelix ERP</div>
            <div style={{ fontSize: 16, color: "#94A3B8" }}>phelixerp.online</div>
          </div>
        </div>

        {/* Badge */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           10,
            background:    "rgba(34, 197, 94, 0.15)",
            border:        "1px solid rgba(34, 197, 94, 0.4)",
            padding:       "8px 18px",
            borderRadius:  999,
            alignSelf:     "flex-start",
            fontSize:      18,
            color:         "#86EFAC",
            fontWeight:    600,
            marginBottom:  30,
          }}
        >
          <div
            style={{
              width:        10,
              height:       10,
              borderRadius: "50%",
              background:   "#22C55E",
              display:      "flex",
            }}
          />
          {badge}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize:      title.length > 70 ? 56 : 64,
            fontWeight:    900,
            lineHeight:    1.1,
            letterSpacing: -1.5,
            marginBottom:  24,
            color:         "white",
            display:       "flex",
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize:    24,
            color:       "#94A3B8",
            lineHeight:  1.4,
            display:     "flex",
            maxWidth:    900,
          }}
        >
          {subtitle}
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            position:       "absolute",
            bottom:         60,
            left:           70,
            right:          70,
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                background:    "#F97316",
                color:         "white",
                padding:       "12px 22px",
                borderRadius:  10,
                fontSize:      18,
                fontWeight:    700,
                display:       "flex",
              }}
            >
              Read Guide →
            </div>
            <div style={{ fontSize: 16, color: "#64748B", display: "flex" }}>
              Free FBR demo · WhatsApp: +92 311 8366981
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width:  1200,
      height: 630,
    }
  );
}
