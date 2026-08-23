import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ticker = (p.get("ticker") ?? "—").toUpperCase().slice(0, 6);
  const name = (p.get("name") ?? "").slice(0, 40);
  const score = p.get("score") ?? "?";
  const insiders = p.get("insiders") ?? "1";
  const value = p.get("value") ?? "";
  const pctlow = p.get("pctlow") ?? "";
  const buyer = (p.get("buyer") ?? "").slice(0, 34);
  const role = (p.get("role") ?? "").slice(0, 44);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#09090b",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 6, color: "#f4f4f5" }}>
            FORM<span style={{ color: "#34d399" }}>FOUR</span>
          </div>
          <div style={{ display: "flex", color: "#6e6e78", fontSize: 22 }}>insider buying alerts</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#34d399" }}>{ticker}</div>
            {name && (
              <div style={{ display: "flex", fontSize: 38, color: "#e4e4e7", maxWidth: 700 }}>{name}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            {[
              ["SCORE", `${score}/99`],
              ["INSIDERS", insiders],
              ["COMBINED", value ? `$${value}` : "—"],
              ...(pctlow ? [["VS 52W LOW", `${pctlow}%`] as [string, string]] : []),
            ].map(([label, val]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "#141417",
                  border: "1px solid #26262b",
                  borderRadius: 14,
                  padding: "18px 28px",
                }}
              >
                <div style={{ display: "flex", fontSize: 18, letterSpacing: 2, color: "#6e6e78" }}>{label}</div>
                <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: "#f4f4f5" }}>{val}</div>
              </div>
            ))}
          </div>

          {buyer && (
            <div style={{ display: "flex", fontSize: 30, color: "#9d9da8" }}>
              🧑‍💼 {buyer}
              {role && <span style={{ color: "#6e6e78" }}>&nbsp;· {role}</span>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 22, color: "#6e6e78" }}>
            Open-market buys from SEC Form 4 filings · not investment advice
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#34d399" }}>formfour.vercel.app</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
