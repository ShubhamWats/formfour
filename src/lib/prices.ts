import fs from "node:fs";
import path from "node:path";
import type { PriceContext } from "@/types";

interface Bar {
  date: string;
  low: number;
  high: number;
  close: number;
}

const seriesCache = new Map<string, Bar[] | null>();
const inflight = new Map<string, Promise<Bar[] | null>>();

const CACHE_DIR = path.join(process.cwd(), ".cache", "prices");
const CACHE_TTL_MS =
  Number.parseInt(process.env.PRICE_TTL_HOURS ?? "12", 10) * 3_600_000;

function cachePath(ticker: string): string {
  return path.join(CACHE_DIR, `${ticker.replace(/[^A-Z0-9.-]/gi, "_")}.json`);
}

function readDiskCache(ticker: string): Bar[] | null | undefined {
  try {
    const file = cachePath(ticker);
    if (!fs.existsSync(file)) return undefined;
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return undefined;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      bars: Bar[];
    };
    return Array.isArray(parsed.bars) && parsed.bars.length > 0
      ? parsed.bars
      : undefined;
  } catch {
    return undefined;
  }
}

function writeDiskCache(ticker: string, bars: Bar[]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(ticker), JSON.stringify({ bars }));
  } catch {
    // read-only filesystem (serverless) — memory cache still applies
  }
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        fiftyTwoWeekLow?: number;
        fiftyTwoWeekHigh?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          low?: (number | null)[];
          high?: (number | null)[];
          close?: (number | null)[];
        }>;
      };
    }>;
  };
}

async function fetchSeries(ticker: string): Promise<Bar[] | null> {
  if (seriesCache.has(ticker)) return seriesCache.get(ticker)!;
  if (inflight.has(ticker)) return inflight.get(ticker)!;

  const disk = readDiskCache(ticker);
  if (disk) {
    seriesCache.set(ticker, disk);
    return disk;
  }

  const job = (async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as YahooChart;
      const r = data.chart?.result?.[0];
      const ts = r?.timestamp;
      const q = r?.indicators?.quote?.[0];
      if (!r || !ts || !q) return null;
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = q.close?.[i];
        if (close === null || close === undefined || !(close > 0)) continue;
        bars.push({
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          low: q.low?.[i] ?? close,
          high: q.high?.[i] ?? close,
          close,
        });
      }
      return bars.length >= 30 ? bars : null;
    } catch {
      return null;
    } finally {
      inflight.delete(ticker);
    }
  })();

  inflight.set(ticker, job);
  const result = await job;
  seriesCache.set(ticker, result);
  if (result) writeDiskCache(ticker, result);
  return result;
}

function contextFromBars(
  ticker: string,
  barsUpTo: Bar[],
): PriceContext | null {
  if (barsUpTo.length < 30) return null;
  const last = barsUpTo[barsUpTo.length - 1];
  const window = barsUpTo.slice(-252);
  const low52 = Math.min(...window.map((b) => b.low));
  const high52 = Math.max(...window.map((b) => b.high));
  const closes = window.map((b) => b.close);
  const chgSince = (back: number): number | undefined => {
    const i = closes.length - 1 - back;
    if (i < 0 || !(closes[i] > 0)) return undefined;
    return ((last.close - closes[i]) / closes[i]) * 100;
  };
  return {
    ticker,
    close: last.close,
    low52,
    high52,
    pctFromLow: ((last.close - low52) / low52) * 100,
    chg1wPct: chgSince(5),
    chg1mPct: chgSince(21),
    rangePosPct:
      high52 > low52 ? ((last.close - low52) / (high52 - low52)) * 100 : undefined,
  };
}

export async function priceContextAsOf(
  ticker: string,
  dateIso?: string,
): Promise<PriceContext | null> {
  const bars = await fetchSeries(ticker);
  if (!bars) return null;
  if (!dateIso) return contextFromBars(ticker, bars);
  const idx = findIndexOnOrBefore(bars, dateIso);
  if (idx < 0) return null;
  return contextFromBars(ticker, bars.slice(0, idx + 1));
}

function findIndexOnOrBefore(bars: Bar[], dateIso: string): number {
  let lo = 0;
  let hi = bars.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= dateIso) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const liveCache = new Map<string, PriceContext | null>();

export async function priceContext(
  ticker: string,
): Promise<PriceContext | null> {
  if (liveCache.has(ticker)) return liveCache.get(ticker)!;
  const result = await priceContextAsOf(ticker);
  liveCache.set(ticker, result);
  return result;
}
