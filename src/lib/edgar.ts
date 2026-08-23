import { XMLParser } from "fast-xml-parser";
import type { FilingRef, InsiderBuy, ParsedFiling } from "@/types";

const SEC_BASE = "https://www.sec.gov";
const MIN_INTERVAL_MS = 115;

let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function userAgent(): string {
  const ua = process.env.EDGAR_USER_AGENT;
  if (!ua || !ua.includes("@")) {
    throw new Error(
      'Set EDGAR_USER_AGENT="Your Name your@email.com" in .env.local (required by the SEC)',
    );
  }
  return ua;
}

async function secFetch(path: string): Promise<string> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const url = path.startsWith("http") ? path : `${SEC_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "text/html,application/json,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
  return res.text();
}

async function secFetchRetry(path: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await secFetch(path);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (/SEC (403|429|5\d\d)/.test(msg)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function masterIndexPath(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  const stamp = d.toISOString().slice(0, 10).replaceAll("-", "");
  return `/Archives/edgar/daily-index/${yyyy}/QTR${quarter}/master.${stamp}.idx`;
}

function parseMaster(raw: string, dateStr: string): FilingRef[] {
  const refs: FilingRef[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 5) continue;
    const [cik, name, form, , filename] = parts;
    if (form !== "4") continue;
    refs.push({
      filerCik: cik.padStart(10, "0"),
      companyName: name,
      accession: filename.split("/").pop()?.replace(/\.txt$/, "") ?? "",
      filedAt: dateStr,
      txtUrl: `${SEC_BASE}/Archives/${filename}`,
    });
  }
  return refs;
}

export interface DailyIndex {
  date: string;
  refs: FilingRef[];
}

export async function fetchMasterForOffsetDay(
  daysBack: number,
): Promise<DailyIndex | null> {
  const d = new Date(Date.now() - daysBack * 86_400_000);
  try {
    const raw = await secFetchRetry(masterIndexPath(d));
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, refs: parseMaster(raw, dateStr) };
  } catch (err) {
    if (/SEC (404|403)/.test(String(err))) return null;
    throw err;
  }
}

export async function fetchRecentMasterIndexes(
  tradingDaysWanted: number,
): Promise<DailyIndex[]> {
  const results: DailyIndex[] = [];
  const maxBack = tradingDaysWanted * 2 + 6;
  for (let back = 0; back <= maxBack && results.length < tradingDaysWanted; back++) {
    const idx = await fetchMasterForOffsetDay(back);
    if (idx && idx.refs.length > 0) results.push(idx);
  }
  return results;
}

type Node = Record<string, unknown>;

function obj(v: unknown): Node | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Node)
    : null;
}

function arr(v: unknown): Node[] {
  if (Array.isArray(v)) return v.filter((x) => obj(x) !== null) as Node[];
  const o = obj(v);
  return o ? [o] : [];
}

function leaf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return "";
  const o = v as Node;
  if ("value" in o) return leaf(o.value);
  return "";
}

function field(node: unknown, key: string): string {
  return leaf(obj(node)?.[key]);
}

function toNum(s: string): number {
  if (!s) return 0;
  const n = Number.parseFloat(s.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function truthy(v: unknown): boolean {
  const s = leaf(v).toLowerCase();
  return s === "1" || s === "true";
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function roleLabel(rel: Node | null): { role: string; title: string | null } {
  if (!rel) return { role: "Insider", title: null };
  const isDirector = truthy(rel.isDirector);
  const isOfficer = truthy(rel.isOfficer);
  const isTenPct = truthy(rel.isTenPercentOwner);
  const officerTitle = field(rel, "officerTitle") || null;
  const parts: string[] = [];
  if (isDirector) parts.push("Director");
  if (isOfficer) parts.push(officerTitle ?? "Officer");
  if (isTenPct) parts.push("10% Owner");
  return { role: parts.join(", ") || "Insider", title: officerTitle };
}

function parseOwnershipDoc(xml: string): ParsedFiling | null {
  let root: Node;
  try {
    root = parser.parse(xml) as Node;
  } catch {
    return null;
  }
  const doc = obj(root.ownershipDocument);
  if (!doc) return null;
  const issuer = obj(doc.issuer);
  if (!issuer) return null;

  const issuerCik = field(issuer, "issuerCik");
  const issuerName = field(issuer, "issuerName");
  const symbol = field(issuer, "issuerTradingSymbol") || null;
  const period = field(doc, "periodOfReport");

  const owners = arr(doc.reportingOwner);
  const primary = owners[0] ?? {};
  const ownerIdNode = obj(primary.reportingOwnerId);
  const { role, title } = roleLabel(obj(primary.reportingOwnerRelationship));
  const ownerName = field(ownerIdNode, "rptOwnerName");
  const ownerCikRaw = field(ownerIdNode, "rptOwnerCik");

  const table = obj(doc.nonDerivativeTable);
  const txs = table ? arr(table.nonDerivativeTransaction) : [];

  const buys: InsiderBuy[] = [];
  for (const t of txs) {
    const code = field(obj(t.transactionCoding), "transactionCode").toUpperCase();
    if (code !== "P") continue;
    const amounts = obj(t.transactionAmounts);
    if (!amounts) continue;
    const shares = toNum(field(amounts, "transactionShares"));
    const price = toNum(field(amounts, "transactionPricePerShare"));
    if (!(shares > 0) || !(price > 0)) continue;
    buys.push({
      ownerName,
      ownerCik: ownerCikRaw || null,
      role,
      officerTitle: title,
      shares,
      price,
      valueUsd: Math.round(shares * price),
      tradedAt: field(t.transactionDate, "value") || period,
      code,
      ownedAfter:
        toNum(field(obj(t.postTransactionAmounts), "sharesOwnedFollowingTransaction")) ||
        undefined,
    });
  }

  if (buys.length === 0) return null;
  return { issuerCik, issuerName, symbol, period, buys };
}

export async function fetchAndParseFiling(
  ref: FilingRef,
): Promise<ParsedFiling | null> {
  const raw = await secFetchRetry(ref.txtUrl);
  const xmlBlocks = raw.match(/<ownershipDocument[\s\S]*?<\/ownershipDocument\s*>/g);
  if (!xmlBlocks) return null;

  let merged: ParsedFiling | null = null;
  for (const block of xmlBlocks) {
    const parsed = parseOwnershipDoc(block);
    if (!parsed) continue;
    if (!merged) {
      merged = parsed;
    } else {
      merged.buys.push(...parsed.buys);
    }
  }
  return merged;
}

let tickerMap: Map<number, string> | null = null;

export async function tickerForCik(cik: string): Promise<string | null> {
  if (!tickerMap) {
    const raw = await secFetchRetry("/files/company_tickers.json");
    const parsed = JSON.parse(raw) as Record<
      string,
      { cik_str: number; ticker: string }
    >;
    tickerMap = new Map(Object.values(parsed).map((r) => [r.cik_str, r.ticker]));
  }
  return tickerMap.get(Number.parseInt(cik, 10)) ?? null;
}
