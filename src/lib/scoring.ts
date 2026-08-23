import type { IssuerSignal, InsiderBuy, PriceContext } from "@/types";

function valuePoints(totalValueUsd: number): number {
  if (totalValueUsd >= 1_000_000) return 30;
  if (totalValueUsd >= 500_000) return 26;
  if (totalValueUsd >= 250_000) return 20;
  if (totalValueUsd >= 100_000) return 12;
  if (totalValueUsd >= 50_000) return 8;
  return 4;
}

function clusterPoints(insiderCount: number): number {
  return Math.min(36, insiderCount * 9);
}

function proximityPoints(pctFromLow: number): { points: number; label: string } {
  if (pctFromLow <= 5) return { points: 24, label: "price within 5% of 52-week low" };
  if (pctFromLow <= 10) return { points: 18, label: "price within 10% of 52-week low" };
  if (pctFromLow <= 15) return { points: 12, label: "price within 15% of 52-week low" };
  if (pctFromLow <= 30) return { points: 6, label: `price ${Math.round(pctFromLow)}% above 52-week low` };
  return { points: 0, label: "" };
}

const TOP_TITLES = /\b(C?EO|CFO|COO|PRESIDENT|CHIEF)\b/i;

function dedupeBuys(buys: InsiderBuy[]): InsiderBuy[] {
  const byKey = new Map<string, InsiderBuy>();
  for (const b of buys) {
    const key = `${b.ownerCik ?? b.ownerName}|${b.tradedAt}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.shares += b.shares;
      existing.valueUsd += b.valueUsd;
    } else {
      byKey.set(key, { ...b });
    }
  }
  return [...byKey.values()];
}

export function buildSignal(
  issuerCik: string,
  issuerName: string,
  rawBuys: InsiderBuy[],
  price: PriceContext | null,
): IssuerSignal {
  const buys = dedupeBuys(rawBuys).sort((a, b) => a.tradedAt.localeCompare(b.tradedAt));
  const owners = new Set(buys.map((b) => b.ownerCik ?? b.ownerName));
  const insiderCount = owners.size;
  const totalValueUsd = buys.reduce((sum, b) => sum + b.valueUsd, 0);
  const dates = buys.map((b) => b.tradedAt).sort();

  const reasons: string[] = [];
  let score = valuePoints(totalValueUsd) + clusterPoints(insiderCount);

  reasons.push(
    insiderCount > 1
      ? `${insiderCount} insiders bought within days`
      : "single insider purchase",
  );
  reasons.push(`$${formatUsd(totalValueUsd)} combined`);

  if (price) {
    const prox = proximityPoints(price.pctFromLow);
    score += prox.points;
    if (prox.label) reasons.push(prox.label);
  }

  if (buys.some((b) => b.officerTitle && TOP_TITLES.test(b.officerTitle))) {
    score += 5;
    reasons.push("top executive among buyers");
  }

  return {
    issuerCik,
    issuerName,
    ticker: price?.ticker ?? null,
    insiderCount,
    totalValueUsd,
    firstTradeDate: dates[0] ?? "",
    lastTradeDate: dates[dates.length - 1] ?? "",
    price,
    score: Math.min(99, Math.round(score)),
    reasons,
    topBuys: buys.slice(0, 4),
  };
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}
