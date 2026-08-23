import fs from "node:fs";
import path from "node:path";
import {
  fetchAndParseFiling,
  fetchRecentMasterIndexes,
  tickerForCik,
} from "../src/lib/edgar";
import { priceContext } from "../src/lib/prices";
import { buildSignal } from "../src/lib/scoring";
import { adminClient } from "../src/lib/supabase/admin";
import type { FilingRef, InsiderBuy, IssuerSignal, ParsedFiling } from "../src/types";

interface Args {
  days: number;
  limit: number;
  minStore: number;
  dryRun: boolean;
}

const log = (...msg: unknown[]) => console.error("[formfour:ingest]", ...msg);

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

function parseArgs(): Args {
  const args = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    args.set(argv[i].replace(/^--/, ""), argv[i + 1] ?? "");
  }
  return {
    days: Math.max(1, Number.parseInt(args.get("days") ?? "1", 10)),
    limit: Number.parseInt(args.get("limit") ?? "0", 10),
    minStore: Number.parseInt(args.get("min-store") ?? "35", 10),
    dryRun: args.has("dry-run"),
  };
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function valueTier(v: number): number {
  if (v >= 1_000_000) return 30;
  if (v >= 500_000) return 26;
  if (v >= 250_000) return 20;
  if (v >= 100_000) return 12;
  if (v >= 50_000) return 8;
  return 4;
}

async function collectBuys(
  refs: FilingRef[],
): Promise<Map<string, { name: string; symbol: string | null; buys: InsiderBuy[] }>> {
  const byIssuer = new Map<
    string,
    { name: string; symbol: string | null; buys: InsiderBuy[] }
  >();
  let parsed = 0;

  for (let i = 0; i < refs.length; i++) {
    try {
      const filing: ParsedFiling | null = await fetchAndParseFiling(refs[i]);
      if (!filing) continue;
      parsed++;
      const g =
        byIssuer.get(filing.issuerCik) ??
        { name: filing.issuerName, symbol: filing.symbol, buys: [] };
      g.name = filing.issuerName || g.name;
      if (!g.symbol && filing.symbol) g.symbol = filing.symbol;
      g.buys.push(...filing.buys);
      byIssuer.set(filing.issuerCik, g);
    } catch {
      // skip malformed filings
    }
    if ((i + 1) % 100 === 0)
      log(`${i + 1}/${refs.length} filings · parsed ${parsed}`);
  }
  log(`parsed ${parsed}/${refs.length} filings into ${byIssuer.size} issuers`);
  return byIssuer;
}

interface Candidate {
  cik: string;
  name: string;
  symbol: string | null;
  buys: InsiderBuy[];
  insiderCount: number;
  totalValueUsd: number;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const opts = parseArgs();
  const started = Date.now();

  log(`scanning last ${opts.days} trading day(s)…`);
  const indexes = await fetchRecentMasterIndexes(opts.days);
  if (indexes.length === 0) throw new Error("No EDGAR master indexes found");
  const signalDate = indexes[0].date;

  let refs = indexes.flatMap((idx) => idx.refs);
  log(
    `${refs.length} Form 4 filings across ${indexes.length} trading day(s) (${indexes[indexes.length - 1].date} → ${signalDate})`,
  );
  if (opts.limit > 0 && opts.limit < refs.length) {
    refs = refs.slice(0, opts.limit);
    log(`limited to ${refs.length} filings (--limit 0 for all)`);
  }

  const byIssuer = await collectBuys(refs);

  const candidates: Candidate[] = [...byIssuer.entries()]
    .map(([cik, g]) => {
      const owners = new Set(g.buys.map((b) => b.ownerCik ?? b.ownerName));
      return {
        cik,
        ...g,
        insiderCount: owners.size,
        totalValueUsd: g.buys.reduce((s, b) => s + b.valueUsd, 0),
      };
    })
    .filter((c) => c.totalValueUsd >= 50_000 && c.insiderCount >= 1)
    .sort(
      (a, b) =>
        b.insiderCount * 9 + valueTier(b.totalValueUsd) -
        (a.insiderCount * 9 + valueTier(a.totalValueUsd)),
    )
    .slice(0, 60);

  log(`enriching top ${candidates.length} candidates with price context…`);

  const signals: IssuerSignal[] = [];
  for (const c of candidates) {
    let price = null;
    const ticker = (await tickerForCik(c.cik).catch(() => null)) ?? c.symbol;
    if (ticker) price = await priceContext(ticker);
    signals.push(buildSignal(c.cik, c.name, c.buys, price));
  }

  const kept = signals
    .filter((s) => s.score >= opts.minStore)
    .sort((a, b) => b.score - a.score);

  log(
    `${kept.length} signals ≥ ${opts.minStore} points for ${signalDate}; top: ` +
      kept
        .slice(0, 5)
        .map((s) => `${s.ticker ?? s.issuerName.slice(0, 12)}(${s.score})`)
        .join(", "),
  );

  if (opts.dryRun) {
    console.log("\nDRY RUN — nothing stored. Top signals:");
    for (const s of kept.slice(0, 10)) {
      console.log(
        `  score ${String(s.score).padStart(2)}  ${(s.ticker ?? "?").padEnd(6)} ${s.issuerName.slice(0, 32).padEnd(32)} ${s.insiderCount} ins  $${formatUsd(s.totalValueUsd)}`,
      );
    }
    return;
  }

  const supa = adminClient();

  if (kept.length > 0) {
    const rows = kept.map((s) => ({
      signal_date: signalDate,
      issuer_cik: s.issuerCik,
      issuer_name: s.issuerName,
      ticker: s.ticker,
      score: s.score,
      insider_count: s.insiderCount,
      total_value_usd: s.totalValueUsd,
      pct_from_low: s.price ? Number(s.price.pctFromLow.toFixed(2)) : null,
      details: s,
    }));
    const { error } = await supa
      .from("daily_signals")
      .upsert(rows, { onConflict: "signal_date,issuer_cik" });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    log(`stored ${rows.length} signals for ${signalDate}`);
  } else {
    log(`no signals ≥ ${opts.minStore} — nothing stored`);
  }

  const notifyUrl = process.env.DIGEST_NOTIFY_URL;
  if (notifyUrl && process.env.CRON_SECRET) {
    try {
      const res = await fetch(notifyUrl, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const body = await res.text();
      log(`digest notify → HTTP ${res.status}: ${body.slice(0, 200)}`);
    } catch (err) {
      log(`digest notify failed: ${String(err)}`);
    }
  }

  log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
