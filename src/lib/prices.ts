import type { PriceContext } from "@/types";

const cache = new Map<string, PriceContext | null>();

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

export async function priceContext(ticker: string): Promise<PriceContext | null> {
  if (cache.has(ticker)) return cache.get(ticker)!;
  const result = await computePriceContext(ticker);
  cache.set(ticker, result);
  return result;
}

async function computePriceContext(
  ticker: string,
): Promise<PriceContext | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChart;
    const r = data.chart?.result?.[0];
    if (!r) return null;

    let close = r.meta?.regularMarketPrice ?? 0;
    let low52 = r.meta?.fiftyTwoWeekLow ?? 0;
    let high52 = r.meta?.fiftyTwoWeekHigh ?? 0;

    if (!close || !low52 || !high52) {
      const quote = r.indicators?.quote?.[0];
      if (!quote) return null;
      const closes = (quote.close ?? []).filter((n): n is number => n !== null && n > 0);
      const lows = (quote.low ?? []).filter((n): n is number => n !== null && n > 0);
      const highs = (quote.high ?? []).filter((n): n is number => n !== null && n > 0);
      if (closes.length < 30) return null;
      close = close || closes[closes.length - 1];
      low52 = low52 || Math.min(...lows);
      high52 = high52 || Math.max(...highs);
    }

    if (!(close > 0) || !(low52 > 0) || !(high52 > 0)) return null;

    return { ticker, close, low52, high52, pctFromLow: ((close - low52) / low52) * 100 };
  } catch {
    return null;
  }
}
