import fs from "node:fs";
import path from "node:path";
import {
  fetchAndParseFiling,
  fetchRecentMasterIndexes,
  tickerForCik,
} from "../src/lib/edgar";
import { priceContext } from "../src/lib/prices";
import { buildSignal } from "../src/lib/scoring";
import type { InsiderBuy, ParsedFiling } from "../src/types";

interface Args {
  days: number;
  limit: number;
  top: number;
  minInsiders: number;
}

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
    days: Math.max(1, Number.parseInt(args.get("days") ?? "3", 10)),
    limit: Number.parseInt(args.get("limit") ?? "400", 10),
    top: Number.parseInt(args.get("top") ?? "15", 10),
    minInsiders: Number.parseInt(args.get("min-insiders") ?? "1", 10),
  };
}

const log = (...msg: unknown[]) => console.error("[formfour]", ...msg);

async function main(): Promise<void> {
  loadEnvLocal();
  const opts = parseArgs();
  const started = Date.now();

  log(`scanning last ${opts.days} trading day(s) of SEC Form 4 filings…`);
  const indexes = await fetchRecentMasterIndexes(opts.days);
  if (indexes.length === 0) throw new Error("No EDGAR master indexes found");

  let refs = indexes.flatMap((idx) => idx.refs);
  log(
    `${refs.length} Form 4 filings across ${indexes.length} trading day(s) (${indexes[indexes.length - 1].date} → ${indexes[0].date})`,
  );
  const totalRefs = refs.length;
  refs = refs.slice(0, opts.limit);
  if (opts.limit < totalRefs)
    log(`processing first ${opts.limit} of ${totalRefs} (--limit N to change)`);

  const byIssuer = new Map<string, { name: string; symbol: string | null; buys: InsiderBuy[] }>();
  let parsed = 0;
  let buyFilings = 0;

  for (let i = 0; i < refs.length; i++) {
    try {
      const filing: ParsedFiling | null = await fetchAndParseFiling(refs[i]);
      if (!filing) continue;
      parsed++;
      const g = byIssuer.get(filing.issuerCik) ?? {
        name: filing.issuerName,
        symbol: filing.symbol,
        buys: [],
      };
      g.name = filing.issuerName || g.name;
      if (!g.symbol && filing.symbol) g.symbol = filing.symbol;
      g.buys.push(...filing.buys);
      byIssuer.set(filing.issuerCik, g);
      buyFilings++;
    } catch {
      // skip broken filings silently
    }
    if ((i + 1) % 50 === 0)
      log(`${i + 1}/${refs.length} filings fetched · ${buyFilings} purchase filings · ${byIssuer.size} issuers`);
  }

  const candidates = [...byIssuer.entries()]
    .map(([cik, g]) => {
      const owners = new Set(g.buys.map((b) => b.ownerCik ?? b.ownerName));
      const total = g.buys.reduce((s, b) => s + b.valueUsd, 0);
      return { cik, ...g, insiderCount: owners.size, totalValueUsd: total };
    })
    .filter((c) => c.totalValueUsd >= 50_000 && c.insiderCount >= opts.minInsiders)
    .sort((a, b) => b.insiderCount * 9 + valueTier(b.totalValueUsd) - (a.insiderCount * 9 + valueTier(a.totalValueUsd)))
    .slice(0, 40);

  log(`enriching top ${candidates.length} issuers with price context…`);

  const signals = [];
  for (const c of candidates) {
    let price = null;
    const ticker = (await tickerForCik(c.cik).catch(() => null)) ?? c.symbol;
    if (ticker) price = await priceContext(ticker);
    signals.push(buildSignal(c.cik, c.name, c.buys, price));
  }

  signals.sort((a, b) => b.score - a.score);
  const shown = signals.slice(0, opts.top);

  console.log("");
  console.log(`FORMFOUR SIGNALS — ${new Date().toISOString().slice(0, 10)} — top ${shown.length}`);
  console.log("=".repeat(96));
  for (const [i, s] of shown.entries()) {
    const sym = (s.ticker ?? "?").padEnd(6);
    const name = s.issuerName.slice(0, 30).padEnd(30);
    const val = `$${formatUsd(s.totalValueUsd)}`.padStart(8);
    const prox =
      s.price === null ? "   n/a" : `${s.price.pctFromLow >= 0 ? "+" : ""}${Math.round(s.price.pctFromLow)}%`.padStart(5);
    console.log(
      `${String(i + 1).padStart(2)}. score ${String(s.score).padStart(2)}  ${sym} ${name} ${String(s.insiderCount)} ins ${val}  ${prox} vs 52w-low`,
    );
    console.log(`    ${s.reasons.join(" · ")}`);
    for (const b of s.topBuys.slice(0, 2)) {
      console.log(
        `     ↳ ${b.ownerName} (${b.role}) bought ${formatUsd(b.valueUsd)}$ on ${b.tradedAt}`,
      );
    }
  }
  console.log("=".repeat(96));
  log(
    `done in ${((Date.now() - started) / 1000).toFixed(0)}s — ${parsed}/${refs.length} filings parsed, ${byIssuer.size} issuers with purchases`,
  );
  log("NOT INVESTMENT ADVICE — data for research only");
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
