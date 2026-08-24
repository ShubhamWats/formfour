import fs from "node:fs";
import path from "node:path";
import { fetchMasterByDate } from "../src/lib/edgar";
import { restSelect, restUpsert } from "../src/lib/rest";

const log = (...msg: unknown[]) => console.error("[formfour:seed]", ...msg);

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
  const dates = await restSelect<{ signal_date: string }>(
    "daily_signals",
    "select=signal_date&order=signal_date.desc&limit=1000",
  );
  log(`${dates.length} fully-ingested days found`);

  const seen = new Set<string>();
  const rows: { accession: string }[] = [];
  for (const d of dates) {
    try {
      const idx = await fetchMasterByDate(d.signal_date);
      if (!idx) continue;
      let added = 0;
      for (const ref of idx.refs) {
        if (!seen.has(ref.accession)) {
          seen.add(ref.accession);
          rows.push({ accession: ref.accession });
          added++;
        }
      }
      log(`${d.signal_date}: ${added} accessions`);
    } catch (err) {
      log(`${d.signal_date} failed: ${String(err).slice(0, 120)}`);
    }
  }

  for (let i = 0; i < rows.length; i += 900) {
    await restUpsert("parsed_filings", rows.slice(i, i + 900), "accession");
  }
  log(`ledger seeded with ${rows.length} accessions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
