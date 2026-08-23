import { Suspense } from "react";
import Link from "next/link";
import SubscribeForm from "./subscribe-form";
import ConfirmBanner from "./confirm-banner";

const SAMPLE = {
  ticker: "AAT",
  name: "American Assets Trust",
  score: 45,
  insiders: 1,
  value: "$1.1M",
  prox: "+29% vs 52w low",
  who: "Ernest S. Rady — Director, Executive Chairman",
};

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-extrabold tracking-[0.2em]">FORMFOUR</span>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/signals" className="hover:text-white">Live signals</Link>
            <Link href="/backtest" className="hover:text-white">Track record</Link>
            <Link href="/how-it-works" className="hover:text-white">How it works</Link>
            <Link
              href="#signup"
              className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-300"
            >
              Get alerts
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <Suspense fallback={null}>
          <ConfirmBanner />
        </Suspense>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div className="flex flex-col gap-6">
            <p className="inline-flex w-fit items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Sourced nightly from SEC Form 4 filings
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              See what insiders buy with{" "}
              <span className="text-emerald-400">their own money.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-zinc-400">
              FormFour scans every SEC Form 4 filing each night, finds clusters of
              open-market executive purchases, and scores them for conviction — so
              you see the buys that matter, in your inbox before the market opens.
            </p>
            <div id="signup" className="pt-2">
              <SubscribeForm />
              <p className="mt-3 text-xs text-zinc-500">
                Free weekly digest. No card required. Unsubscribe anytime.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
              <span className="font-semibold tracking-widest text-zinc-400">SAMPLE ALERT</span>
              <span>Fri · Aug 21</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-zinc-300">
                  {SAMPLE.ticker} · {SAMPLE.name}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                  score {SAMPLE.score}
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {SAMPLE.insiders} insider · {SAMPLE.value} combined · {SAMPLE.prox}
              </p>
              <p className="mt-3 text-sm text-zinc-200">
                {SAMPLE.who} bought {SAMPLE.value} of stock on the open market.
              </p>
            </div>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
              Public SEC data, scored by FormFour. Not investment advice.
            </p>
            <div className="mt-3 text-center">
              <Link href="/signals" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                View live signals — no signup →
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-zinc-900/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                ["01", "Scan", "Every SEC Form 4 filed yesterday is parsed overnight — purchases only, sales ignored."],
                ["02", "Score", "Clusters of insiders, dollar size, and proximity to 52-week lows are weighted into one conviction score."],
                ["03", "Deliver", "Only signals scoring 55+ reach your inbox, ranked and explained in plain English."],
              ].map(([n, title, body]) => (
                <div key={n} className="flex flex-col gap-3">
                  <span className="font-mono text-xs text-emerald-400">{n}</span>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Read the full breakdown — scoring rubric, what we ignore, why it matters
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto w-full max-w-6xl px-6 text-xs leading-relaxed text-zinc-600">
          <p className="max-w-2xl">
            FormFour republishes publicly available SEC filing data for research purposes only.
            Nothing here is investment advice or a recommendation to buy or sell any security.
            Insider buying does not guarantee future returns. © {new Date().getFullYear()} FormFour.
          </p>
        </div>
      </footer>
    </div>
  );
}
