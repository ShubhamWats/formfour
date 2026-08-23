import type { IssuerSignal } from "@/types";
import { formatUsd } from "./scoring";

const API = "https://api.anthropic.com/v1/messages";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function claude(
  system: string,
  user: string,
  maxTokens = 500,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[ai] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    return data.content?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error("[ai]", err);
    return null;
  }
}

export async function generateNarrative(s: IssuerSignal): Promise<string | null> {
  const facts = [
    `Company: ${s.issuerName}${s.ticker ? ` (${s.ticker})` : ""}`,
    `${s.insiderCount} insider(s) bought $${formatUsd(s.totalValueUsd)} combined on the open market between ${s.firstTradeDate} and ${s.lastTradeDate}.`,
    s.topBuys
      .slice(0, 3)
      .map(
        (b) =>
          `- ${b.ownerName} (${b.role}): ${b.shares.toLocaleString()} shares at $${b.price.toFixed(2)} = $${formatUsd(b.valueUsd)}${b.ownedAfter ? `, owns ${b.ownedAfter.toLocaleString()} after` : ""}`,
      )
      .join("\n"),
    s.price
      ? `Price $${s.price.close.toFixed(2)} is ${Math.round(s.price.pctFromLow)}% above its 52-week low (${Math.round(s.price.rangePosPct ?? 0)}% of range).`
      : "No price context available.",
    `Conviction score ${s.score}/99 based on: ${s.reasons.join("; ")}.`,
  ].join("\n");

  return claude(
    "You write for FormFour, an insider-buying research digest for long-term investors. Given factual data about an SEC Form 4 insider-buying cluster, write 2-3 sentences of neutral analysis: what happened, who did it, and what context makes it interesting or uninteresting. Be concrete and grounded ONLY in the provided facts — never speculate beyond them, never give advice, never use hype language. Plain English, no headings.",
    facts,
    300,
  );
}

export async function generateDailyBrief(signals: IssuerSignal[]): Promise<string | null> {
  if (signals.length === 0) return null;
  const list = signals
    .slice(0, 6)
    .map(
      (s, i) =>
        `${i + 1}. ${s.ticker ?? s.issuerName} (score ${s.score}) — ${s.insiderCount} insider(s), $${formatUsd(s.totalValueUsd)} combined, ${Math.round(s.price?.pctFromLow ?? 0)}% above 52w low. Top buyer: ${s.topBuys[0]?.ownerName ?? "n/a"} (${s.topBuys[0]?.role ?? ""}).`,
    )
    .join("\n");

  return claude(
    "You write the opening note for FormFour, a daily insider-buying digest for long-term investors. Given today's flagged clusters, write a tight 3-4 sentence morning brief: what stands out across today's cluster(s), any pattern worth noticing (sector, size, proximity to lows), and one honest caveat. Ground everything in the provided facts only. No advice, no predictions, no hype. Plain English.",
    `Today's flagged clusters:\n${list}`,
    350,
  );
}
