import fs from "node:fs";
import path from "node:path";
import {
  fetchAndParseFiling,
  fetchMasterByDate,
  fetchRecentMasterIndexes,
  tickerForCik,
  type DailyIndex,
} from "../src/lib/edgar";
import { priceContextAsOf } from "../src/lib/prices";
import { buildSignal } from "../src/lib/scoring";
import { generateNarrative, aiConfigured } from "../src/lib/ai";
import { restSelect, restUpsert } from "../src/lib/rest";
import type {
  FilingRef,
  InsiderBuy,
  IssuerSignal,
  ParsedFiling,
} from "../src/types";

export interface IngestOptions {
  on?: string;
  days: number;
  limit: number;
  minStore: number;
  dryRun: boolean;
  notify?: boolean;
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

function parseArgs(): IngestOptions & { notify: boolean } {
  const argv = process.argv.slice(2);
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    args.set(argv[i].replace(/^--/, ""), argv[i + 1] ?? "");
  }
  return {
    on: args.get("on") || undefined,
    days: Math.max(1, Number.parseInt(args.get("days") ?? "1", 10)),
    limit: Number.parseInt(args.get("limit") ?? "0", 10),
    minStore: Number.parseInt(args.get("min-store") ?? "35", 10),
    dryRun: args.has("dry-run"),
    notify: !args.has("no-notify"),
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

async function requireSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

export async function runIngest(opts: IngestOptions): Promise<string | null> {
  const started = Date.now();

  let indexes: DailyIndex[];
  if (opts.on) {
    const idx = await fetchMasterByDate(opts.on);
    if (!idx || idx.refs.length === 0) {
      log(`${opts.on}: no master index (weekend/holiday?) — skipping`);
      return null;
    }
    indexes = [idx];
  } else {
    indexes = await fetchRecentMasterIndexes(opts.days);
  }
  if (indexes.length === 0) throw new Error("No EDGAR master indexes found");
  const signalDate = indexes[0].date;

  let refs = indexes.flatMap((idx) => idx.refs);
  log(
    `[${signalDate}] ${refs.length} Form 4 filings across ${indexes.length} trading day(s)`,
  );
  if (opts.limit > 0 && opts.limit < refs.length) {
    refs = refs.slice(0, opts.limit);
    log(`limited to ${refs.length} filings`);
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

  log(`enriching top ${candidates.length} candidates with as-of price context…`);

  const signals: IssuerSignal[] = [];
  for (const c of candidates) {
    let price = null;
    const ticker = (await tickerForCik(c.cik).catch(() => null)) ?? c.symbol;
    if (ticker) price = await priceContextAsOf(ticker, signalDate);
    signals.push(buildSignal(c.cik, c.name, c.buys, price));
  }

  const kept = signals
    .filter((s) => s.score >= opts.minStore)
    .sort((a, b) => b.score - a.score);

  if (!opts.dryRun) {
    try {
      const cutoff = new Date(Date.now() - 120 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const known = await restSelect<{ issuer_cik: string }>(
        "daily_signals",
        `select=issuer_cik&signal_date=gte.${cutoff}&limit=1000`,
      );
      const knownSet = new Set(known.map((r) => r.issuer_cik));
      let flagged = 0;
      for (const s of signals) {
        if (!knownSet.has(s.issuerCik)) {
          s.reasons.push("first tracked cluster in this name");
          flagged++;
        }
      }
      if (flagged > 0) log(`${flagged} first-time clusters flagged`);
    } catch {
      // anomaly flag is best-effort only
    }
  }

  if (!opts.dryRun && aiConfigured() && kept.length > 0) {
    log("generating AI narratives for top 5 signals…");
    for (const s of kept.slice(0, 5)) {
      const n = await generateNarrative(s);
      if (n) s.narrative = n;
    }
  }

  log(
    `${kept.length} signals ≥ ${opts.minStore} for ${signalDate}; top: ` +
      kept
        .slice(0, 5)
        .map((s) => `${s.ticker ?? s.issuerName.slice(0, 12)}(${s.score})`)
        .join(", "),
  );

  if (opts.dryRun) {
    for (const s of kept.slice(0, 8)) {
      console.log(
        `  score ${String(s.score).padStart(2)}  ${(s.ticker ?? "?").padEnd(6)} ${s.issuerName.slice(0, 30).padEnd(30)} $${formatUsd(s.totalValueUsd)}`,
      );
    }
    return signalDate;
  }

  await requireSupabase();

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
    await restUpsert("daily_signals", rows, "signal_date,issuer_cik");
    log(`stored ${rows.length} signals for ${signalDate}`);

    const buyRowsMap = new Map<string, Record<string, unknown>>();
    for (const s of kept) {
      if (!s.ticker) continue;
      for (const b of byIssuer.get(s.issuerCik)?.buys ?? []) {
        if (!b.tradedAt) continue;
        const key = `${s.issuerCik}|${b.tradedAt}|${b.ownerName}`;
        const existing = buyRowsMap.get(key);
        if (existing) {
          existing.shares = Number(existing.shares) + b.shares;
          existing.value_usd = Number(existing.value_usd) + b.valueUsd;
          if (b.ownedAfter) {
            existing.owned_after = Math.max(
              Number(existing.owned_after ?? 0),
              b.ownedAfter,
            );
          }
        } else {
          buyRowsMap.set(key, {
            signal_date: signalDate,
            traded_at: b.tradedAt,
            issuer_cik: s.issuerCik,
            ticker: s.ticker,
            owner_name: b.ownerName,
            owner_cik: b.ownerCik,
            role: b.role,
            shares: b.shares,
            price: b.price,
            value_usd: b.valueUsd,
            owned_after: b.ownedAfter ?? null,
            base_price: s.price?.close ?? null,
          });
        }
      }
    }
    const buyRows = [...buyRowsMap.values()];
    await restUpsert(
      "insider_buys",
      buyRows,
      "signal_date,issuer_cik,owner_name,traded_at",
    );
    log(`stored ${buyRows.length} insider-buy ledger rows`);
  } else {
    log(`no signals ≥ ${opts.minStore} — nothing stored`);
  }

  const notifyUrl = process.env.DIGEST_NOTIFY_URL;
  if (opts.notify && notifyUrl && process.env.CRON_SECRET) {
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
  return signalDate;
}

if (process.argv[1]?.includes("ingest")) {
  loadEnvLocal();
  runIngest(parseArgs()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
