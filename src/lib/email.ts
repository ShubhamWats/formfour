import type { IssuerSignal, InsiderBuy, PriceContext } from "@/types";
import { formatUsd } from "./scoring";

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BASE_STYLE =
  "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

const BG = "#09090b";
const CARD = "#141417";
const BORDER = "#26262b";
const TEXT = "#f4f4f5";
const MUTED = "#9d9da8";
const FAINT = "#6e6e78";
const GREEN = "#34d399";

function fmtPct(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function pctColor(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return MUTED;
  return n >= 0 ? GREEN : "#f87171";
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtShares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function secFilingsUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40`;
}

function priceRow(p: PriceContext): string {
  const cells: Array<[string, string, string | null]> = [
    ["PRICE", `$${p.close.toFixed(2)}`, null],
    ["VS 52W LOW", `${Math.round(p.pctFromLow)}%`, p.pctFromLow <= 15 ? GREEN : null],
    ["52W RANGE", `$${p.low52.toFixed(2)}–${p.high52.toFixed(2)}`, null],
    ["1 WEEK", fmtPct(p.chg1wPct), pctColor(p.chg1wPct)],
    ["1 MONTH", fmtPct(p.chg1mPct), pctColor(p.chg1mPct)],
  ];
  const tds = cells
    .map(
      ([label, val, color]) =>
        `<td style="${BASE_STYLE}padding:8px 14px 8px 0;font-size:11px"><span style="color:${FAINT};letter-spacing:.5px">${label}</span><br><strong style="color:${color ?? TEXT};font-size:13px">${esc(val)}</strong></td>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;background:#0e0e11;border:1px solid ${BORDER};border-radius:8px" bgcolor="#0e0e11"><tr>${tds}</tr></table>`;
}

function buyerRows(buys: InsiderBuy[]): string {
  const rows = buys
    .map(
      (b) => `<tr>
        <td style="${BASE_STYLE}padding:8px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${TEXT};font-weight:600">${esc(b.ownerName)}
          <br><span style="font-size:11px;color:${MUTED}">${esc(b.role)}</span></td>
        <td align="right" style="${BASE_STYLE}padding:8px 0;border-bottom:1px solid ${BORDER};font-size:12px;color:${TEXT}">
          <strong>$${formatUsd(b.valueUsd)}</strong>
          <br><span style="font-size:11px;color:${MUTED}">${fmtShares(b.shares)} sh @ $${b.price.toFixed(2)} · ${esc(shortDate(b.tradedAt))}${b.ownedAfter && b.ownedAfter > 0 ? ` · owns ${fmtShares(b.ownedAfter)}` : ""}</span>
        </td>
      </tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${rows}</table>`;
}

function signalCard(s: IssuerSignal): string {
  const prox =
    s.price === null
      ? ""
      : ` · ${Math.round(s.price.pctFromLow)}% above 52w low`;
  const windowDates =
    s.firstTradeDate === s.lastTradeDate
      ? shortDate(s.lastTradeDate)
      : `${shortDate(s.firstTradeDate)} – ${shortDate(s.lastTradeDate)}`;

  return `
  <tr><td style="padding:0 0 14px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;border-collapse:separate;background:${CARD}" bgcolor="${CARD}">
      <tr><td style="padding:18px">

        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="${BASE_STYLE}font-size:17px;font-weight:800;color:${GREEN}">
            ${esc(s.ticker ?? "—")}${s.ticker ? "" : "·"}<span style="color:${TEXT};font-weight:600;font-size:15px"> ${s.ticker ? "·" : ""} ${esc(s.issuerName.slice(0, 42))}</span>
          </td>
          <td align="right" style="${BASE_STYLE}">
            <span style="background:${GREEN};color:#09090b;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800">score ${s.score}</span>
          </td>
        </tr></table>

        <div style="${BASE_STYLE}font-size:13px;color:${MUTED};margin-top:6px">
          ${s.insiderCount} insider${s.insiderCount > 1 ? "s" : ""} bought
          <strong style="color:${GREEN}">$${formatUsd(s.totalValueUsd)}</strong> combined · traded ${windowDates}${prox}
        </div>

        ${s.price ? priceRow(s.price) : ""}

        <div style="${BASE_STYLE}font-size:13px;color:${MUTED};margin-top:12px;line-height:1.5">
          <span style="color:${GREEN};font-weight:700">WHY IT FLAGGED</span> · ${esc(s.reasons.join(" · "))}
        </div>

        ${buyerRows(s.topBuys)}

        <div style="${BASE_STYLE}margin-top:12px">
          <a href="${secFilingsUrl(s.issuerCik)}" style="font-size:12px;color:${GREEN}">View their Form&nbsp;4 filings on SEC.gov ↗</a>
        </div>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderDigestHtml(
  signals: IssuerSignal[],
  dateLabel: string,
  unsubscribeUrl: string,
): string {
  const cards = signals.map(signalCard).join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${BG}" bgcolor="${BG}">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};padding:24px 12px"><tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
      <tr><td style="${BASE_STYLE}padding:8px 4px 22px">
        <span style="font-weight:800;font-size:18px;letter-spacing:3px;color:${TEXT}">FORM<span style="color:${GREEN}">FOUR</span></span>
        <span style="color:${FAINT};font-size:12px;margin-left:8px">insider buying alerts</span>
      </td></tr>
      <tr><td style="${BASE_STYLE}font-size:22px;font-weight:700;color:${TEXT};padding-bottom:4px">Top insider purchases</td></tr>
      <tr><td style="${BASE_STYLE}font-size:13px;color:${MUTED};padding-bottom:16px">${esc(dateLabel)} · open-market buys only, from SEC Form 4 filings</td></tr>
      ${cards || '<tr><td style="color:' + MUTED + ';font-size:14px">No qualifying signals today.</td></tr>'}
      <tr><td style="padding:28px 4px 8px;font-size:11px;color:${FAINT};line-height:1.6">
        FormFour republishes publicly available SEC filing data for research purposes. This is not investment advice or a recommendation to buy or sell any security.
        <br><a href="${esc(unsubscribeUrl)}" style="color:${FAINT}">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderConfirmHtml(confirmUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${BG}" bgcolor="${BG}">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};padding:40px 12px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${BORDER};border-radius:12px" bgcolor="${CARD}">
      <tr><td style="${BASE_STYLE}padding:36px;text-align:center">
        <div style="font-weight:800;font-size:18px;letter-spacing:3px;color:${TEXT};padding-bottom:18px">FORM<span style="color:${GREEN}">FOUR</span></div>
        <div style="font-size:15px;color:${TEXT};padding-bottom:8px;font-weight:600">Confirm your subscription</div>
        <p style="font-size:13px;color:${MUTED};margin:0 0 22px;line-height:1.6">One click and you'll start receiving insider-buying alerts from SEC Form 4 data.</p>
        <a href="${esc(confirmUrl)}" style="display:inline-block;background:${GREEN};color:#09090b;text-decoration:none;border-radius:8px;padding:11px 24px;font-size:14px;font-weight:700">Confirm subscription</a>
        <p style="font-size:11px;color:${FAINT};margin-top:22px">Didn't request this? Ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey || !from) {
    console.log(`[email skipped — not configured] to=${to} subject=${subject}`);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend ${res.status} for ${to}: ${body.slice(0, 300)}`);
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email] fetch failed for ${to}:`, err);
    return { ok: false, error: String(err) };
  }
}
