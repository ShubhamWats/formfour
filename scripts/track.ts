import fs from "node:fs";
import path from "node:path";
import { priceContext } from "../src/lib/prices";
import { restSelect, restUpsert } from "../src/lib/rest";
import type { IssuerSignal } from "../src/types";

const HORIZONS: Array<[number, string]> = [
  [7, "ret_7d"],
  [30, "ret_30d"],
  [90, "ret_90d"],
];

const log = (...msg: unknown[]) => console.error("[formfour:track]", ...msg);

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

interface SignalRow {
  signal_date: string;
  issuer_cik: string;
  ticker: string | null;
  details: IssuerSignal;
}

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ret_7d: number | null;
  ret_30d: number | null;
  ret_90d: number | null;
}

function daysBetween(fromIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - from) / 86_400_000);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const started = Date.now();

  const cutoff = new Date(Date.now() - 120 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const signals = await restSelect<SignalRow>(
    "daily_signals",
    `select=signal_date,issuer_cik,ticker,details&signal_date=gte.${cutoff}&order=signal_date.desc&limit=1000`,
  );
  log(`${signals.length} signals in last 120 days`);

  if (signals.length === 0) {
    log("nothing to do");
    return;
  }

  const existing = await restSelect<OutcomeRow>(
    "signal_outcomes",
    `select=signal_date,issuer_cik,ret_7d,ret_30d,ret_90d&signal_date=gte.${cutoff}&limit=1000`,
  );
  const existingMap = new Map<string, OutcomeRow>();
  for (const o of existing) existingMap.set(`${o.signal_date}|${o.issuer_cik}`, o);

  const tickers = new Set<string>();
  for (const s of signals) {
    const t = s.ticker ?? s.details.ticker;
    if (t) tickers.add(t);
  }
  log(`fetching current prices for ${tickers.size} tickers…`);
  const prices = new Map<string, number>();
  for (const t of tickers) {
    try {
      const ctx = await priceContext(t);
      if (ctx && ctx.close > 0) prices.set(t, ctx.close);
    } catch {
      // leave missing
    }
  }

  let updated = 0;
  let skipped = 0;
  const batches = new Map<string, Record<string, unknown>[]>();

  for (const s of signals) {
    const ticker = s.ticker ?? s.details.ticker;
    const base = Number(s.details?.price?.close);
    if (!ticker || !prices.has(ticker)) {
      skipped++;
      continue;
    }
    if (!(base > 0)) {
      skipped++;
      continue;
    }
    const cur = prices.get(ticker)!;
    const age = daysBetween(s.signal_date);
    const ex = existingMap.get(`${s.signal_date}|${s.issuer_cik}`);
    const row: Record<string, unknown> = {
      signal_date: s.signal_date,
      issuer_cik: s.issuer_cik,
      ticker,
      base_price: base,
    };
    const fillCols: string[] = [];
    for (const [days, col] of HORIZONS) {
      const already = (ex?.[col as keyof OutcomeRow] as number | null) ?? null;
      if (age >= days && already === null) {
        row[col] = Math.round(((cur - base) / base) * 100_000) / 1000;
        fillCols.push(col);
        if (!ex) updated++;
      }
    }
    if (ex && fillCols.length === 0) continue;
    const shape = fillCols.sort().join(",");
    if (!batches.has(shape)) batches.set(shape, []);
    batches.get(shape)!.push(row);
  }

  for (const [shape, rows] of batches) {
    log(`upserting ${rows.length} rows (filling: ${shape || "baseline only"})`);
    await restUpsert("signal_outcomes", rows, "signal_date,issuer_cik");
  }
  log(
    `done in ${((Date.now() - started) / 1000).toFixed(0)}s — ${batches.size} batch(es), ${updated} newly tracked, ${skipped} skipped`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
