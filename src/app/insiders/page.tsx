import type { Metadata } from "next";
import Link from "next/link";
import { restSelect } from "@/lib/rest";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Insider Leaderboard — FormFour",
  description:
    "Which corporate insiders' open-market purchases actually performed? Ranked by forward returns of their past buys.",
};

interface BuyRow {
  signal_date: string;
  issuer_cik: string;
  ticker: string | null;
  owner_name: string;
  role: string | null;
  value_usd: number | string | null;
}

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ret_30d: number | null;
  ret_90d: number | null;
}

interface Stat {
  name: string;
  roles: Set<string>;
  tickers: Set<string>;
  clusters: number;
  totalUsd: number;
  rets30: number[];
  rets90: number[];
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function avg(a: number[]): number | null {
  if (a.length === 0) return null;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-zinc-600">—</span>;
  return (
    <span className={`font-mono font-semibold ${v >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

export default async function InsidersPage() {
  let stats: Stat[] = [];
  try {
    const buys = await restSelect<BuyRow>(
      "insider_buys",
      "select=signal_date,issuer_cik,ticker,owner_name,role,value_usd&signal_date=gte.2026-01-01&order=value_usd.desc&limit=3000",
    );
    const outcomes = await restSelect<OutcomeRow>(
      "signal_outcomes",
      "select=signal_date,issuer_cik,ret_30d,ret_90d&ret_30d=not.is.null&limit=2000",
    );
    const omap = new Map(outcomes.map((o) => [`${o.signal_date}|${o.issuer_cik}`, o]));

    const map = new Map<string, Stat>();
    for (const b of buys) {
      const key = b.owner_name.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          name: b.owner_name,
          roles: new Set(),
          tickers: new Set(),
          clusters: 0,
          totalUsd: 0,
          rets30: [],
          rets90: [],
        });
      }
      const st = map.get(key)!;
      if (b.role) st.roles.add(b.role);
      if (b.ticker) st.tickers.add(b.ticker);
      const o = omap.get(`${b.signal_date}|${b.issuer_cik}`);
      if (o) {
        st.clusters++;
        if (o.ret_30d !== null) st.rets30.push(o.ret_30d);
        if (o.ret_90d !== null) st.rets90.push(o.ret_90d);
      }
      const v = Number(b.value_usd ?? 0);
      if (Number.isFinite(v)) st.totalUsd += v;
    }

    stats = [...map.values()]
      .filter((s) => s.rets30.length >= 2)
      .sort((a, b) => (avg(b.rets30) ?? -999) - (avg(a.rets30) ?? -999))
      .slice(0, 25);
  } catch {
    stats = [];
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
          Insider leaderboard
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-zinc-400">
          Which executives&apos; own-money purchases actually performed after we
          flagged them? Ranked by average 30-day forward return of their
          detected buys.
        </p>

        {stats.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-white/10 bg-zinc-900/60 p-10 text-center text-sm text-zinc-400">
            Not enough matured outcomes yet — this table fills as tracked signals
            pass their 30-day window. Check back soon.
          </div>
        ) : (
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Insider</th>
                  <th className="px-4 py-3">Tickers</th>
                  <th className="px-4 py-3 text-right">Bought</th>
                  <th className="px-4 py-3 text-right">Avg 30d</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={s.name} className={i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/20"}>
                    <td className="px-4 py-3 font-mono text-zinc-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-200">{s.name}</div>
                      <div className="text-xs text-zinc-500">
                        {[...s.roles].slice(0, 1).join("")}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-400">
                      {[...s.tickers].slice(0, 4).join(" ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {fmtUsd(s.totalUsd)}
                    </td>
                    <td className="px-4 py-3 text-right text-base">
                      <Pct v={avg(s.rets30)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
          Forward returns measured from each alert-day close to 30 days later.
          Small samples are noisy; past performance does not guarantee future results.
        </p>
      </main>
    </div>
  );
}
