import fs from "node:fs";
import path from "node:path";
import { restSelect } from "../src/lib/rest";
import type { IssuerSignal } from "../src/types";

const log = (...msg: unknown[]) => console.error("[formfour:tune]", ...msg);

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

interface OutcomeRow {
  signal_date: string;
  issuer_cik: string;
  ret_30d: number | null;
  ret_90d: number | null;
}

interface Sample {
  ret30: number;
  scoreBand: string;
  insiders: number;
  valueTier: string;
  pctLowBand: string;
  hasExec: boolean;
  firstCluster: boolean;
}

function band(score: number): string {
  if (score >= 85) return "85+";
  if (score >= 70) return "70–84";
  if (score >= 55) return "55–69";
  if (score >= 40) return "40–54";
  return "<40";
}

function tier(v: number): string {
  if (v >= 1_000_000) return "≥$1M";
  if (v >= 500_000) return "$500k–1M";
  if (v >= 250_000) return "$250–500k";
  if (v >= 100_000) return "$100–250k";
  return "<$100k";
}

function lowBand(p: number | undefined): string {
  const x = p ?? 999;
  if (x <= 10) return "≤10% off low";
  if (x <= 25) return "10–25% off low";
  return ">25% off low";
}

const TOP_EXEC = /\b(C?EO|CFO|COO|PRESIDENT|CHIEF)\b/i;

async function main(): Promise<void> {
  loadEnvLocal();
  const outcomes = await restSelect<OutcomeRow>(
    "signal_outcomes",
    "select=signal_date,issuer_cik,ret_30d,ret_90d&ret_30d=not.is.null&order=signal_date.desc&limit=2000",
  );
  log(`${outcomes.length} matured outcomes loaded`);

  const samples: Sample[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const rows = await restSelect<{ signal_date: string; issuer_cik: string; details: IssuerSignal }>(
      "daily_signals",
      `select=signal_date,issuer_cik,details&order=signal_date.desc&limit=1000&offset=${offset}`,
    );
    const omap = new Map(outcomes.map((o) => [`${o.signal_date}|${o.issuer_cik}`, o]));
    for (const r of rows) {
      const o = omap.get(`${r.signal_date}|${r.issuer_cik}`);
      if (!o || o.ret_30d === null) continue;
      const d = r.details;
      samples.push({
        ret30: o.ret_30d,
        scoreBand: band(d.score),
        insiders: d.insiderCount,
        valueTier: tier(d.totalValueUsd),
        pctLowBand: lowBand(d.price?.pctFromLow),
        hasExec: d.topBuys.some(
          (b) => TOP_EXEC.test(b.role) || (b.officerTitle ? TOP_EXEC.test(b.officerTitle) : false),
        ),
        firstCluster: d.reasons.some((r2) => r2.includes("first tracked cluster")),
      });
    }
    if (rows.length < 1000) break;
  }

  const n = samples.length;
  if (n < 20) {
    console.log(`\nOnly ${n} matured samples — need ≥20 before tuning means anything.`);
    console.log("The nightly pipeline fills this automatically. Rerun in a few weeks.");
    return;
  }

  const mean = (a: number[]) =>
    a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length;

  function group(label: string, keyOf: (s: Sample) => string): void {
    const groups = new Map<string, number[]>();
    for (const s of samples!) {
      const k = keyOf(s);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s.ret30);
    }
    console.log(`\n${label}`);
    for (const [k, rets] of [...groups.entries()].sort()) {
      const m = mean(rets)!;
      const win = (rets.filter((r) => r > 0).length / rets.length) * 100;
      console.log(
        `  ${k.padEnd(14)} n=${String(rets.length).padStart(4)}  avg30=${(m >= 0 ? "+" : "") + m.toFixed(1)}%  hit=${Math.round(win)}%`,
      );
    }
  }

  console.log(
    `\n=== FORMFOUR CALIBRATION REPORT — ${n} matured samples ===`,
  );
  group("BY SCORE BAND", (s) => s.scoreBand);
  group("BY CLUSTER SIZE", (s) => (s.insiders >= 3 ? "3+ insiders" : s.insiders === 2 ? "2 insiders" : "1 insider"));
  group("BY VALUE TIER", (s) => s.valueTier);
  group("BY DISTANCE FROM 52W LOW", (s) => s.pctLowBand);
  group("BY EXEC PRESENCE", (s) => (s.hasExec ? "CEO/CFO/COO buying" : "no top exec"));
  group("FIRST-TIME CLUSTER", (s) => (s.firstCluster ? "first tracked" : "repeat name"));

  const recs: string[] = [];
  const singles = samples.filter((s) => s.insiders === 1).map((s) => s.ret30);
  const multi = samples.filter((s) => s.insiders >= 2).map((s) => s.ret30);
  const mSingles = mean(singles);
  const mMulti = mean(multi);
  if (mSingles !== null && mMulti !== null && mMulti > mSingles + 3)
    recs.push(`Clusters with 2+ insiders outperform singles by ${(mMulti - mSingles).toFixed(1)}pts — consider raising the cluster weight or setting --min-insiders 2.`);

  const cheap = samples.filter((s) => s.pctLowBand === "≤10% off low").map((s) => s.ret30);
  const far = samples.filter((s) => s.pctLowBand === ">25% off low").map((s) => s.ret30);
  const mCheap = mean(cheap);
  const mFar = mean(far);
  if (mCheap !== null && mFar !== null && mFar > mCheap + 2)
    recs.push("Signals near 52w lows UNDERPERFORM far-from-low ones — proximity bonus may be backwards in this regime.");

  const firstC = samples.filter((s) => s.firstCluster).map((s) => s.ret30);
  const repeatC = samples.filter((s) => !s.firstCluster).map((s) => s.ret30);
  const mFirst = mean(firstC);
  const mRepeat = mean(repeatC);
  if (mFirst !== null && mRepeat !== null && Math.abs(mFirst - mRepeat) > 3)
    recs.push(`First-time clusters avg ${mFirst!.toFixed(1)}% vs repeats ${mRepeat!.toFixed(1)}% — the anomaly flag is informative; consider scoring it.`);

  console.log("\n=== RECOMMENDATIONS ===");
  if (recs.length === 0)
    console.log("No statistically meaningful deviations yet. Keep collecting.");
  else recs.forEach((r, i) => console.log(`${i + 1}. ${r}`));
  console.log(
    "\nNOTE: small samples are noisy. Only act on differences >5pts with n>30 per bucket.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
