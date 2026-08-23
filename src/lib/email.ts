import type { IssuerSignal } from "@/types";
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

export function renderDigestHtml(
  signals: IssuerSignal[],
  dateLabel: string,
  unsubscribeUrl: string,
): string {
  const cards = signals
    .map((s) => {
      const prox =
        s.price === null
          ? ""
          : `<span style="color:#6b7280">·</span> ${Math.round(s.price.pctFromLow)}% vs 52w low`;
      const buys = s.topBuys
        .slice(0, 3)
        .map(
          (b) =>
            `<div style="font-size:13px;color:#4b5563;margin-top:4px">${esc(b.ownerName)} <span style="color:#9ca3af">(${esc(b.role)})</span> — $${formatUsd(b.valueUsd)}</div>`,
        )
        .join("");
      return `
      <tr><td style="padding:10px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate">
          <tr>
            <td style="padding:14px 16px">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="${BASE_STYLE}font-size:16px;font-weight:700;color:#111827">${esc(s.ticker ?? "—")} · ${esc(s.issuerName.slice(0, 40))}</td>
                <td align="right" style="${BASE_STYLE}"><span style="background:#111827;color:#fff;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600">score ${s.score}</span></td>
              </tr></table>
              <div style="${BASE_STYLE}font-size:13px;color:#6b7280;margin-top:4px">${s.insiderCount} insider${s.insiderCount > 1 ? "s" : ""} · $${formatUsd(s.totalValueUsd)} combined ${prox}</div>
              <div style="${BASE_STYLE}font-size:13px;color:#374151;margin-top:8px">${esc(s.reasons.join(" · "))}</div>
              ${buys}
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;background:#f9fafb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 12px"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="${BASE_STYLE}padding:8px 4px 20px">
        <span style="font-weight:800;font-size:18px;letter-spacing:2px;color:#111827">FORMFOUR</span>
        <span style="color:#9ca3af;font-size:12px;margin-left:8px">insider buying alerts</span>
      </td></tr>
      <tr><td style="${BASE_STYLE}font-size:20px;font-weight:700;color:#111827;padding-bottom:4px">Top insider purchases</td></tr>
      <tr><td style="${BASE_STYLE}font-size:13px;color:#6b7280;padding-bottom:12px">${esc(dateLabel)} · sourced from SEC Form 4 filings</td></tr>
      ${cards || '<tr><td style="color:#6b7280;font-size:14px">No qualifying signals today.</td></tr>'}
      <tr><td style="padding:28px 4px 8px;font-size:11px;color:#9ca3af;line-height:1.5">
        FormFour republishes publicly available SEC filing data for research purposes. This is not investment advice or a recommendation to buy or sell any security.
        <br><a href="${esc(unsubscribeUrl)}" style="color:#9ca3af">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderConfirmHtml(confirmUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f9fafb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 12px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:12px">
      <tr><td style="${BASE_STYLE}padding:32px;text-align:center">
        <div style="font-weight:800;font-size:18px;letter-spacing:2px;color:#111827;padding-bottom:16px">FORMFOUR</div>
        <div style="font-size:15px;color:#111827;padding-bottom:8px;font-weight:600">Confirm your subscription</div>
        <p style="font-size:13px;color:#6b7280;margin:0 0 20px">One click and you'll start receiving insider-buying alerts from SEC Form 4 data.</p>
        <a href="${esc(confirmUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600">Confirm subscription</a>
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
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
