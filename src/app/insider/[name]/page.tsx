import type { Metadata } from "next";
import Link from "next/link";
import { restSelect } from "@/lib/rest";
import { formatUsd } from "@/lib/scoring";

export const revalidate = 3600;

interface BuyRow {
  signal_date: string;
  issuer_cik: string;
  ticker: string | null;
  owner_name: string;
  role: string | null;
  shares: number | string | null;
  price: number | string | null;
  value_usd: number | string | null;
}

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ret_7d: number | null;
  ret_30d: number | null;
  ret_90d: number | null;
}

function num(v: number | string | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function avg(a: number[]): number | null {
  if (a.length === 0) return null;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `${decodeURIComponent(name)} — insider report card`,
    description: `Forward performance of insider buys by ${decodeURIComponent(name)}, tracked by FormFour.`,
  };
}

export default async function InsiderPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw).slice(0, 80);

  let buys: BuyRow[] = [];
  let outcomes: OutcomeRow[] = [];
  try {
    buys = await restSelect<BuyRow>(
      "insider_buys",
      `select=signal_date,issuer_cik,ticker,owner_name,role,shares,price,value_usd&owner_name=ilike.${encodeURIComponent(name)}&order=signal_date.desc&limit=200`,
    );
    outcomes = await restSelect<OutcomeRow>(
      "signal_outcomes",
      "select=signal_date,issuer_cik,ret_7d,ret_30d,ret_90d&ret_30d=not.is.null&order=signal_date.desc&limit=2000",
    );
  } catch {
    buys = [];
  }

  const omap = new Map(outcomes.map((o) => [`${o.signal_date}|${o.issuer_cik}`, o]));
  const rets30: number[] = [];
  for (const b of buys) {
    const o = omap.get(`${b.signal_date}|${b.issuer_cik}`);
    if (o?.ret_30d !== null && o?.ret_30d !== undefined) rets30.push(o.ret_30d);
  }
  const a30 = avg(rets30);
  const totalUsd = buys.reduce((s, b) => s + num(b.value_usd), 0);
  const role = buys[0]?.role ?? "";
  const tickers = [...new Set(buys.map((b) => b.ticker).filter(Boolean))] as string[];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-extrabold tracking-[0.2em]">
            FORM<span className="text-emerald-400">FOUR</span>
          </Link>
          <Link href="/insiders" className="text-sm text-zinc-400 hover:text-white">
            Leaderboard
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {[role, ...tickers].filter(Boolean).join(" · ") || "insider purchases"}
        </p>

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            ["FLAGGED BUYS", String(buys.length), "text-zinc-100"],
            ["TOTAL BOUGHT", fmtUsd(totalUsd), "text-zinc-100"],
            ["AVG 30D", a30 === null ? "—" : `${a30 >= 0 ? "+" : ""}${a30.toFixed(1)}%`, a30 === null ? "text-zinc-600" : a30 >= 0 ? "text-emerald-400" : "text-red-400"],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-xl border border-white/10 bg-zinc-900/60 px-2 py-4">
              <div className="text-[10px] tracking-wider text-zinc-500">{l}</div>
              <div className={`mt-1 font-mono text-lg font-bold ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3">
          {buys.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
              No tracked purchases found for this name.
            </div>
          )}
          {buys.map((b, i) => {
            const o = omap.get(`${b.signal_date}|${b.issuer_cik}`);
            return (
              <div key={`${b.signal_date}-${i}`} className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-emerald-400">
                    {b.ticker ?? "—"}
                    <span className="ml-2 font-sans text-xs text-zinc-500">{b.signal_date}</span>
                  </span>
                  <span className="text-sm font-semibold text-zinc-200">${formatUsd(num(b.value_usd))}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {num(b.shares).toLocaleString()} sh @ ${num(b.price).toFixed(2)}
                  {b.role ? ` · ${b.role}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {o?.ret_7d !== null && o?.ret_7d !== undefined && (
                    <span className={`font-mono text-xs font-semibold ${o.ret_7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>7d {o.ret_7d >= 0 ? "+" : ""}{o.ret_7d.toFixed(1)}%</span>
                  )}
                  {o?.ret_30d !== null && o?.ret_30d !== undefined && (
                    <span className={`font-mono text-xs font-semibold ${o.ret_30d >= 0 ? "text-emerald-400" : "text-red-400"}`}>30d {o.ret_30d >= 0 ? "+" : ""}{o.ret_30d.toFixed(1)}%</span>
                  )}
                  {o?.ret_90d !== null && o?.ret_90d !== undefined && (
                    <span className={`font-mono text-xs font-semibold ${o.ret_90d >= 0 ? "text-emerald-400" : "text-red-400"}`}>90d {o.ret_90d >= 0 ? "+" : ""}{o.ret_90d.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[11px] text-zinc-600">
          Returns measured vs alert-day close. Past performance does not guarantee future results.
        </p>
      </main>
    </div>
  );
}
