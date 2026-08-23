import fs from "node:fs";
import path from "node:path";
import { aiConfigured, generateNarrative } from "../src/lib/ai";
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

const stub: IssuerSignal = {
  issuerCik: "0002001557",
  issuerName: "Innovative Leisure Corp",
  ticker: "INVLW",
  insiderCount: 4,
  totalValueUsd: 1_615_588,
  firstTradeDate: "2026-08-18",
  lastTradeDate: "2026-08-21",
  price: { ticker: "INVLW", close: 0.45, low52: 0.39, high52: 1.12, pctFromLow: 15.4, rangePosPct: 7.9 },
  score: 95,
  reasons: ["4 insiders bought within days", "$1.6M combined", "price within 15% of 52-week low"],
  topBuys: [
    {
      ownerName: "Test Buyer One",
      ownerCik: null,
      role: "Director, 10% Owner",
      officerTitle: null,
      shares: 2_000_000,
      price: 0.44,
      valueUsd: 880_000,
      tradedAt: "2026-08-20",
      code: "P",
      ownedAfter: 5_400_000,
    },
  ],
};

loadEnvLocal();
async function main(): Promise<void> {
  console.log("aiConfigured:", aiConfigured());
  const narrative = await generateNarrative(stub);
  if (!narrative) {
    console.error("FAILED: no narrative returned");
    process.exit(1);
  }
  console.log("\n--- AI OUTPUT ---\n" + narrative + "\n-----------------");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
