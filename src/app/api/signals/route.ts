import { NextResponse } from "next/server";
import { restSelect } from "@/lib/rest";
import type { IssuerSignal } from "@/types";

export const revalidate = 600;

export async function GET(req: Request) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
  };

  const limitRaw = new URL(req.url).searchParams.get("limit") ?? "25";
  const limit = Math.min(50, Math.max(1, Number.parseInt(limitRaw, 10) || 25));

  try {
    const latest = await restSelect<{ signal_date: string }>(
      "daily_signals",
      "select=signal_date&order=signal_date.desc&limit=1",
    );
    if (latest.length === 0) {
      return NextResponse.json({ date: null, signals: [] }, { headers: cors });
    }
    const date = latest[0].signal_date;
    const rows = await restSelect<{ details: IssuerSignal }>(
      "daily_signals",
      `select=details&signal_date=eq.${date}&order=score.desc&limit=${limit}`,
    );
    return NextResponse.json(
      {
        date,
        count: rows.length,
        disclaimer:
          "Public SEC filing data for research only. Not investment advice.",
        signals: rows.map((r) => r.details),
      },
      { headers: cors },
    );
  } catch {
    return NextResponse.json(
      { error: "Data unavailable" },
      { status: 503, headers: cors },
    );
  }
}
