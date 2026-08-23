import type { Metadata } from "next";
import Link from "next/link";
import SubscribeForm from "../subscribe-form";
import { restSelect } from "@/lib/rest";
import { formatUsd } from "@/lib/scoring";
import type { IssuerSignal } from "@/types";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Live Insider-Buying Signals — FormFour",
  description:
    "Today's highest-conviction insider-buying clusters from SEC Form 4 filings — public, no signup required.",
};

interface OutcomeRow {
  ret_30d: number | null;
}

async function getSignals(): Promise<{
  date: string | null;
  signals: IssuerSignal[];
  stats: { avg30: number; winRate: number; n: number } | null;
}> {
  if (!process.env.SUPABASE_URL) return { date: null, signals: [], stats: null };
  try {
    const latest = await restSelect<{ signal_date: string }>(
      "daily_signals",
      "select=signal_date&order=signal_date.desc&limit=1",
    );
    if (latest.length === 0) return { date: null, signals: [], stats: null };
    const date = latest[0].signal_date;
    const rows = await restSelect<{ details: IssuerSignal }>(
      "daily_signals",
      `select=details&signal_date=eq.${date}&order=score.desc&limit=12`,
    );
    const outcomes = await restSelect<OutcomeRow>(
      "signal_outcomes",
      "select=ret_30d&ret_30d=not.is.null&order=signal_date.desc&limit=500",
    );
    let stats: { avg30: number; winRate: number; n: number } | null = null;
    if (outcomes.length >= 10) {
      const rets = outcomes
        .map((o) => o.ret_30d)
        .filter((r): r is number => r !== null);
      const avg30 = rets.reduce((a, b) => a + b, 0) / rets.length;
      const wins = rets.filter((r) => r > 0).length;
      stats = {
        avg30,
        winRate: (wins / rets.length) * 100,
        n: rets.length,
      };
    }
    return { date, signals: rows.map((r) => r.details), stats };
  } catch {
    return { date: null, signals: [], stats: null };
  }
}

export default async function SignalsPage() {
  const { date, signals, stats } = await getSignals();
  const dateLabel = date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-extrabold tracking-[0.2em]">
            FORMFOUR
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/how-it-works" className="hover:text-white">How it works</Link>
            <Link href="/" className="hover:text-white">Home</Link>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-6 pt-14 pb-6 text-center">
          <p className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
            LIVE · no signup needed
          </p>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Today&apos;s insider-buying clusters
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Ranked by conviction score, straight from SEC Form 4 filings.
            {dateLabel && <> Latest scan: <strong className="text-zinc-200">{dateLabel}</strong>.</>}
          </p>

          {stats && (
            <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-3 text-center">
              {[
                ["SIGNALS TRACKED", String(stats.n)],
                ["AVG 30D RETURN", `${stats.avg30 >= 0 ? "+" : ""}${stats.avg30.toFixed(1)}%`],
                ["HIT RATE", `${Math.round(stats.winRate)}%`],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-zinc-900/60 px-2 py-3">
                  <div className="text-[10px] tracking-wider text-zinc-500">{label}</div>
                  <div className={`mt-1 font-mono text-lg font-bold ${val.startsWith("-") ? "text-red-400" : "text-emerald-400"}`}>
                    {val}
                  </div>
                </div>
              ))}
              <p className="col-span-3 text-[11px] leading-relaxed text-zinc-600">
                Forward returns of past alerts vs their alert-day price. Past performance does not guarantee future results.
              </p>
            </div>
          )}
        </section>

        <section className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
          {signals.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-10 text-center text-sm text-zinc-400">
              No signals stored yet. The nightly pipeline fills this page after its first run.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {signals.map((s) => (
                <article key={`${s.issuerCik}-${s.lastTradeDate}`} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono text-base text-emerald-400">
                      {s.ticker ?? "—"}
                      <span className="ml-2 font-sans font-semibold text-zinc-200">{s.issuerName.slice(0, 40)}</span>
                    </h2>
                    <span className="shrink-0 rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-zinc-950">
                      score {s.score}
                    </span>
                  </div>
                  <div className="mt-1">
                    <a
                      href={`/api/card?ticker=${encodeURIComponent(s.ticker ?? "")}&name=${encodeURIComponent(s.issuerName)}&score=${s.score}&insiders=${s.insiderCount}&value=${formatUsd(s.totalValueUsd).replace("$", "")}${s.price ? `&pctlow=${Math.round(s.price.pctFromLow)}` : ""}&buyer=${encodeURIComponent(s.topBuys[0]?.ownerName ?? "")}&role=${encodeURIComponent(s.topBuys[0]?.role ?? "")}`}
                      className="text-[11px] text-zinc-600 hover:text-emerald-400"
                      target="_blank"
                      rel="noreferrer"
                    >
                      share card ↗
                    </a>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {s.insiderCount} insider{s.insiderCount > 1 ? "s" : ""} · ${formatUsd(s.totalValueUsd)} combined
                    {s.price !== null && <> · {Math.round(s.price.pctFromLow)}% above 52-wk low</>}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-300">{s.reasons.join(" · ")}</p>
                  {s.narrative && (
                    <p className="mt-3 border-l-2 border-emerald-400/40 pl-3 text-sm leading-relaxed text-zinc-400">
                      {s.narrative}
                    </p>
                  )}
                  {s.topBuys.slice(0, 3).map((b) => (
                    <p key={b.ownerName} className="mt-2 text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-400">{b.ownerName}</span> ({b.role}) — ${formatUsd(b.valueUsd)}
                      {" "}on {b.tradedAt}
                      {b.ownedAfter ? ` · owns ${b.ownedAfter.toLocaleString()} sh after` : ""}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          )}

          <div className="mt-12 rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/10 to-transparent p-8 text-center">
            <h2 className="text-xl font-bold tracking-tight">Get these before the market opens</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
              The email digest includes full buyer tables and price context. Free while in beta.
            </p>
            <div className="mx-auto mt-6 flex max-w-md justify-center">
              <SubscribeForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto w-full max-w-6xl px-6 text-[11px] leading-relaxed text-zinc-600">
          Public SEC filing data for research purposes only. Not investment advice.
        </div>
      </footer>
    </div>
  );
}
