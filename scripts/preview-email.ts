import fs from "node:fs";
import path from "node:path";
import { renderDigestHtml } from "../src/lib/email";
import type { IssuerSignal } from "../src/types";

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

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const latestRes = await fetch(
    `${url}/rest/v1/daily_signals?select=signal_date&order=signal_date.desc&limit=1`,
    { headers },
  );
  const [latest] = (await latestRes.json()) as Array<{ signal_date: string }>;
  if (!latest) throw new Error("No signals stored");

  const rowsRes = await fetch(
    `${url}/rest/v1/daily_signals?signal_date=eq.${latest.signal_date}&score=gte.40&order=score.desc&limit=5&select=details`,
    { headers },
  );
  const rows = (await rowsRes.json()) as Array<{ details: IssuerSignal }>;
  const signals = rows.map((r) => r.details);

  const html = renderDigestHtml(
    signals,
    new Date(`${latest.signal_date}T12:00:00Z`).toDateString(),
    "https://formfour.vercel.app/api/unsubscribe?token=PREVIEW",
  );

  const out = path.join(process.cwd(), "digest-preview.html");
  fs.writeFileSync(out, html);
  console.log(`wrote ${out} with ${signals.length} signals (${latest.signal_date})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
