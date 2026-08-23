import type { Metadata } from "next";
import Link from "next/link";
import { restSelect } from "@/lib/rest";
import { formatUsd } from "@/lib/scoring";
import type { IssuerSignal } from "@/types";

export const revalidate = 600;

interface Row {
  signal_date: string;
  issuer_cik: string;
  details: IssuerSignal;
}

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ret_7d: number | null;
  ret_30d: number | null;
  ret_90d: number | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  return {
    title: `Insider buying in ${sym} — FormFour`,
    description: `Scored insider-buying clusters detected in ${sym}, from SEC Form 4 filings.`,
    openGraph: { images: [`/api/card?ticker=${encodeURIComponent(sym)}`] },
  };
}

function Ret({ label, val }: { label: string; val: number | null }) {
  if (val === null || val === undefined) return null;
  return (
    <span className={`font-mono text-xs font-semibold ${val >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {label} {val >= 0 ? "+" : ""}
      {val.toFixed(1)}%
    </span>
  );
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase().slice(0, 6);

  let rows: Row[] = [];
  let outcomes: OutcomeRow[] = [];
  try {
    rows = await restSelect<Row>(
      "daily_signals",
      `select=signal_date,issuer_cik,details&ticker=ilike.${ticker}&order=signal_date.desc&limit=40`,
    );
    outcomes = await restSelect<OutcomeRow>(
      "signal_outcomes",
      `select=signal_date,issuer_cik,ret_7d,ret_30d,ret_90d&ticker=ilike.${ticker}&order=signal_date.desc&limit=100`,
    );
  } catch {
    rows = [];
  }

  const omap = new Map(outcomes.map((o) => [`${o.signal_date}|${o.issuer_cik}`, o]));
  const signals = rows.map((r) => r.details);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-extrabold tracking-[0.2em]">
            FORM<span className="text-emerald-400">FOUR</span>
          </Link>
          <Link href="/signals" className="text-sm text-zinc-400 hover:text-white">
            All live signals
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">
          Insider buying in <span className="text-emerald-400">{ticker}</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Every cluster detected from SEC Form 4 filings, newest first.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {signals.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
              No recorded insider-buying clusters for {ticker} yet.
            </div>
          )}
          {signals.map((s, i) => {
            const o = omap.get(`${rows[i]?.signal_date}|${s.issuerCik}`);
            return (
              <article key={`${s.issuerCik}-${i}`} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">{rows[i]?.signal_date}</span>
                  <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-zinc-950">
                    score {s.score}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">
                  {s.insiderCount} insider{s.insiderCount > 1 ? "s" : ""} bought ${formatUsd(s.totalValueUsd)} combined
                </p>
                <p className="mt-1 text-xs text-zinc-500">{s.reasons.join(" · ")}</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <Ret label="7d:" val={o?.ret_7d ?? null} />
                  <Ret label="30d:" val={o?.ret_30d ?? null} />
                  <Ret label="90d:" val={o?.ret_90d ?? null} />
                  {!o && s.price && (
                    <span className="font-mono text-xs text-zinc-600">
                      tracking from ${s.price.close.toFixed(2)}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/10 to-transparent p-6 text-center">
          <Link href="/#signup" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">
            Get alerted when insiders move again →
          </Link>
        </div>
      </main>
    </div>
  );
}
