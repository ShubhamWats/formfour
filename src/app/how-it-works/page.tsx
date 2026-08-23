import type { Metadata } from "next";
import Link from "next/link";
import SubscribeForm from "../subscribe-form";

export const metadata: Metadata = {
  title: "How FormFour Works",
  description:
    "How we turn raw SEC Form 4 filings into scored insider-buying alerts: what we scan, what we ignore, and exactly how the conviction score is calculated.",
};

const STEPS = [
  {
    n: "01",
    title: "Scan",
    body: "Each night our pipeline pulls the SEC's daily index of every Form 4 filed that day — typically 1,000–1,500 filings across all US-listed companies.",
  },
  {
    n: "02",
    title: "Filter",
    body: "We keep only open-market purchases (transaction code P): insiders spending their own cash at market prices. Sales, option exercises, compensation grants and awards are ignored entirely.",
  },
  {
    n: "03",
    title: "Score",
    body: "Purchases are grouped by company. Each cluster gets a conviction score based on how much was bought, how many distinct insiders bought, how close the stock is to its 52-week low, and whether a CEO/CFO is among the buyers.",
  },
  {
    n: "04",
    title: "Deliver",
    body: "Only clusters scoring 55+ make it into your digest — ranked, with each buyer listed by name, role, date and size of purchase, plus price context. Delivered before the US market opens.",
  },
];

const RUBRIC = [
  ["Combined cluster value ≥ $1M", "+30"],
  ["…≥ $500k / $250k / $100k tiers", "up to +26"],
  ["Distinct insiders buying (+9 each)", "up to +36"],
  ["Price within 5–15% of 52-wk low", "up to +24"],
  ["CEO / CFO / COO among buyers", "+5"],
  ["Email threshold", "55+"],
];

const IGNORED = [
  ["Sales & disposals", "Insiders sell for many non-signal reasons: taxes, diversification, estate planning."],
  ["Option exercises", "Buying shares at a pre-set strike price is compensation mechanics, not a market opinion."],
  ["Grants & awards", "Shares granted by the company say nothing about what insiders think the stock is worth."],
  ["Tiny purchases", "Sub-$50k noise is filtered out before scoring even begins."],
];

const FAQ = [
  [
    "Is this investment advice?",
    "No. We republish public SEC filing data and organize it. Nothing in a digest is a recommendation to buy or sell any security.",
  ],
  [
    "When do digests arrive?",
    "Every trading morning around 6:00 AM Eastern — after the SEC finalizes the prior day's filings, before the opening bell.",
  ],
  [
    "What if there are no good signals?",
    "Then you get nothing (or a short 'no qualifying signals' note). We'd rather send nothing than fill space.",
  ],
  [
    "Why does insider buying matter?",
    "Honestly: on its own, it's a weak edge — studies show mixed results when you buy any stock an insider touched. What's more interesting is clustered buying (multiple insiders at once), large open-market purchases, and buys near 52-week lows. We surface those specific patterns and publish our own forward-return track record publicly, so you can judge the data instead of our marketing.",
  ],
];

export default function HowItWorks() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-extrabold tracking-[0.2em]">
            FORMFOUR
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link
              href="/#signup"
              className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-300"
            >
              Get alerts
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            How FormFour <span className="text-emerald-400">works</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
            No black boxes. Here is exactly what we scan, what we throw away,
            and how a pile of government paperwork becomes a five-minute
            morning read.
          </p>
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 py-12">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
              First — what&apos;s a &quot;Form 4&quot;?
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              US law requires corporate insiders — directors, officers, and
              anyone owning more than 10% of a company — to report their trades
              to the SEC within two business days on a form called... Form 4.
              Every purchase must state who bought, when, how many shares, at
              what price, and what they still own afterward.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              All of it is public. The problem isn&apos;t access — it&apos;s
              volume: thousands of filings per day, most of them noise.
              FormFour reads all of them so you don&apos;t have to.
            </p>
          </div>
        </section>

        <section className="border-y border-white/5 bg-zinc-900/40">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-16 md:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3">
                <span className="font-mono text-xs text-emerald-400">{s.n}</span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            The score, fully transparent
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-zinc-400">
            Every signal in your inbox shows its work. Here is the exact rubric,
            capped at 99 points.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            {RUBRIC.map(([what, pts], i) => (
              <div
                key={what}
                className={`flex items-center justify-between px-5 py-4 text-sm ${
                  i % 2 === 0 ? "bg-zinc-900/60" : "bg-zinc-900/30"
                }`}
              >
                <span className="text-zinc-300">{what}</span>
                <span className="font-mono font-semibold text-emerald-400">{pts}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-white/5 bg-zinc-900/40">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              What we deliberately ignore
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {IGNORED.map(([title, body]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-zinc-950 p-5">
                  <h3 className="font-semibold text-zinc-200">✕ {title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Questions people ask
          </h2>
          <div className="mt-10 flex flex-col gap-4">
            {FAQ.map(([q, a]) => (
              <details
                key={q}
                className="group rounded-xl border border-white/10 bg-zinc-900/60 px-5 py-4"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-200 marker:hidden">
                  <span className="mr-2 text-emerald-400 group-open:hidden">+</span>
                  <span className="mr-2 hidden text-emerald-400 group-open:inline">−</span>
                  {q}
                </summary>
                <p className="mt-3 pl-5 text-sm leading-relaxed text-zinc-400">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 pb-24">
          <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/10 to-transparent p-8 text-center sm:p-10">
            <h2 className="text-2xl font-bold tracking-tight">
              See tomorrow&apos;s signals yourself
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
              Free weekly digest while we&apos;re in beta. One email, top
              signals, plain English. Unsubscribe with one click.
            </p>
            <div id="signup" className="mx-auto mt-7 flex max-w-md justify-center">
              <SubscribeForm />
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
