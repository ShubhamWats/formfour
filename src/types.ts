export interface FilingRef {
  filerCik: string;
  companyName: string;
  accession: string;
  filedAt: string;
  txtUrl: string;
}

export interface InsiderBuy {
  ownerName: string;
  ownerCik: string | null;
  role: string;
  officerTitle: string | null;
  shares: number;
  price: number;
  valueUsd: number;
  tradedAt: string;
  code: string;
  ownedAfter?: number;
}

export interface ParsedFiling {
  issuerCik: string;
  issuerName: string;
  symbol: string | null;
  period: string;
  buys: InsiderBuy[];
}

export interface PriceContext {
  ticker: string;
  close: number;
  low52: number;
  high52: number;
  pctFromLow: number;
  chg1wPct?: number;
  chg1mPct?: number;
  rangePosPct?: number;
}

export interface IssuerSignal {
  issuerCik: string;
  issuerName: string;
  ticker: string | null;
  insiderCount: number;
  totalValueUsd: number;
  firstTradeDate: string;
  lastTradeDate: string;
  price: PriceContext | null;
  score: number;
  reasons: string[];
  topBuys: InsiderBuy[];
}
