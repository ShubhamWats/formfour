import type { Metadata } from "next";
import Link from "next/link";
import { restSelect } from "@/lib/rest";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Track Record — FormFour",
  description:
    "How have FormFour's insider-buying alerts actually performed? Forward returns of every tracked signal, by conviction-score band.",
};

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ticker: string | null;
  ret_7d: number | null;
  ret_30d: number | null;
  ret_90d: number | null;
}

interface ScoreRow {
  signal_date: string;
  issuer_cik: string;
  score: number;
}

const BANDS: Array<[string, number, number]> = [
  ["40–54", 40, 54],
  ["55–69", 55, 69],
  ["70–84", 70, 84],
  ["85+", 85, 999],
];

function band(score: number): string | null {
  for (const [label, lo, hi] of BANDS) {
    if (score >= lo && score <= hi) return label;
  }
  return null;
}

function avg(a: number[]): number | null {
  if (a.length === 0) return null;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export default async function BacktestPage() {
  let bands = BANDS.map(([label]) => ({
    label,
    n30: 0,
    avg30: null as number | null,
    win30: null as number | null,
    n90: 0,
    avg90: null as number | null,
  }));
  let total = { n: 0, avg30: null as number | null, win30: null as number | null };
  let error = false;

  try {
    const outcomes = await restSelect<OutcomeRow>(
      "signal_outcomes",
      "select=signal_date,issuer_cik,ticker,ret_7d,ret_30d,ret_90d&ret_30d=not.is.null&order=signal_date.desc&limit=2000",
    );
    const keys = new Set(outcomes.map((o) => `${o.signal_date}|${o.issuer_cik}`));
    const chunk = (qs: string) =>
      restSelect<ScoreRow>("daily_signals", qs);
    const scoreRows = (
      await Promise.all([
        chunk("select=signal_date,issuer_cik,score&order=signal_date.desc&limit=1000"),
        chunk(
          "select=signal_date,issuer_cik,score&order=signal_date.desc&limit=1000&offset=1000",
        ),
      ])
    ).flat();
    const scoreMap = new Map(
      scoreRows
        .filter((r) => keys.has(`${r.signal_date}|${r.issuer_cik}`))
        .map((r) => [`${r.signal_date}|${r.issuer_cik}`, r.score]),
    );

    const buckets = new Map<string, { r30: number[]; r90: number[] }>();
    for (const [label] of BANDS) buckets.set(label, { r30: [], r90: [] });
    const all30: number[] = [];

    for (const o of outcomes) {
      const score = scoreMap.get(`${o.signal_date}|${o.issuer_cik}`);
      if (score === undefined) continue;
      const b = band(score);
      if (!b) continue;
      const bucket = buckets.get(b)!;
      if (o.ret_30d !== null) {
        bucket.r30.push(o.ret_30d);
        all30.push(o.ret_30d);
      }
      if (o.ret_90d !== null) bucket.r90.push(o.ret_90d);
    }

    bands = BANDS.map(([label]) => {
      const bk = buckets.get(label)!;
      return {
        label,
        n30: bk.r30.length,
        avg30: avg(bk.r30),
        win30:
          bk.r30.length > 0
            ? (bk.r30.filter((r) => r > 0).length / bk.r30.length) * 100
            : null,
        n90: bk.r90.length,
        avg90: avg(bk.r90),
      };
    });
    total = {
      n: all30.length,
      avg30: avg(all30),
      win30:
        all30.length > 0
          ? (all30.filter((r) => r > 0).length / all30.length) * 100
          : null,
    };
  } catch {
    error = true;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-extrabold tracking-[0.2em]">
            FORM<span className="text-emerald-400">FOUR</span>
          </Link>
          <Link href="/signals" className="text-sm text-zinc-400 hover:text-white">
            Live signals
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Track record
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-zinc-400">
          Every alert is paper-tracked against its alert-day close. No cherry-picking —
          this table updates automatically as returns mature.
        </p>

        {error ? (
          <div className="mt-12 rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center text-sm text-red-300">
            Data unavailable right now.
          </div>
        ) : total.n === 0 ? (
          <div className="mt-12 rounded-2xl border border-white/10 bg-zinc-900/60 p-10 text-center text-sm text-zinc-400">
            No matured 30-day outcomes yet — the first stats appear once tracked
            signals pass their window. The nightly pipeline handles it automatically.
          </div>
        ) : (
          <>
            <div className="mt-10 grid grid-cols-3 gap-4 text-center">
              {[
                ["MATURED SIGNALS", String(total.n), "text-zinc-100"],
                ["AVG 30D RETURN", `${(total.avg30 ?? 0) >= 0 ? "+" : ""}${(total.avg30 ?? 0).toFixed(1)}%`, (total.avg30 ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"],
                ["HIT RATE", `${Math.round(total.win30 ?? 0)}%`, "text-zinc-100"],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-4">
                  <div className="text-[10px] tracking-wider text-zinc-500">{l}</div>
                  <div className={`mt-1 font-mono text-xl font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Score band</th>
                    <th className="px-4 py-3 text-right">n (30d)</th>
                    <th className="px-4 py-3 text-right">Avg 30d</th>
                    <th className="px-4 py-3 text-right">Hit rate</th>
                    <th className="px-4 py-3 text-right">Avg 90d</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b, i) => (
                    <tr key={b.label} className={i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/20"}>
                      <td className="px-4 py-3 font-mono text-emerald-400">{b.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{b.n30 || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {b.avg30 === null ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <span className={`font-mono font-semibold ${b.avg30 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {b.avg30 >= 0 ? "+" : ""}
                            {b.avg30.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">
                        {b.win30 === null ? "—" : `${Math.round(b.win30)}%`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {b.avg90 === null ? (
                          <span className="text-zinc-600">maturing…</span>
                        ) : (
                          <span className={`font-mono ${b.avg90 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {b.avg90 >= 0 ? "+" : ""}
                            {b.avg90.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-zinc-600">
          Returns are equal-weighted per signal vs alert-day close, before fees and slippage.
          Small samples are noisy; past performance does not guarantee future results.
          This page exists so you can judge the data instead of our marketing.
        </p>

        <div className="mt-12 rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/10 to-transparent p-6 text-center">
          <Link href="/#signup" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">
            Get tomorrow&apos;s signals →
          </Link>
        </div>
      </main>
    </div>
  );
}
