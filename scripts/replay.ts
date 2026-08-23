import fs from "node:fs";
import path from "node:path";
import { runIngest } from "./ingest";

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

const log = (...msg: unknown[]) => console.error("[formfour:replay]", ...msg);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    args.set(argv[i].replace(/^--/, ""), argv[i + 1] ?? "");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env required for replay");
  }

  const days = Math.max(
    1,
    Number.parseInt(args.get("days") ?? "30", 10),
  );
  const minStore = Number.parseInt(args.get("min-store") ?? "35", 10);
  const limitPerDay = Number.parseInt(args.get("limit") ?? "0", 10);
  const fromArg = args.get("from");

  const fromIso = fromArg ?? isoDaysAgo(days);
  const toIso = new Date().toISOString().slice(0, 10);

  log(`replaying EDGAR Form 4 filings ${fromIso} → ${toIso}`);
  let processed = 0;
  let stored = 0;

  for (let t = new Date(`${fromIso}T00:00:00Z`).getTime(); t <= Date.now(); t += 86_400_000) {
    const dateIso = new Date(t).toISOString().slice(0, 10);
    try {
      const result = await runIngest({
        on: dateIso,
        days: 1,
        limit: limitPerDay,
        minStore,
        dryRun: false,
      });
      processed++;
      if (result) stored++;
    } catch (err) {
      log(`${dateIso} failed: ${String(err).slice(0, 200)} — continuing`);
    }
  }

  log(`replay complete: ${processed} calendar days attempted, ${stored} trading days stored`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
