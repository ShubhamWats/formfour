# FormFour

Insider-buying alerts for long-term investors. Scans SEC Form 4 filings nightly,
detects clusters of open-market executive purchases, scores them for conviction,
and delivers a ranked digest by email.

**Not investment advice.** All data is republished public SEC filing information.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in your values
npm run review -- --days 1 --limit 200   # eyeball today's signals in the terminal
npm run ingest -- --days 1 --dry-run     # preview what would be stored
```

The review CLI needs only `EDGAR_USER_AGENT` (SEC requires a declared contact:
`"Your Name you@email.com"`).

## Nightly automation

1. Create a Supabase project, run `supabase/migration.sql`, add
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
2. Test locally: `npm run ingest -- --days 1` (stores to Supabase).
3. Push to GitHub and add repo secrets: `EDGAR_USER_AGENT`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, plus optional `CRON_SECRET` +
   `DIGEST_NOTIFY_URL` (= `https://yourdomain.com/api/cron/digest`) so the
   digest emails right after ingest.
4. The workflow runs Tue–Sat at 10:00 UTC (before US market open). Trigger it
   manually from the Actions tab to verify.

## How the signal works

Only **code P (open-market purchases)** count — option exercises, grants, and
sales are ignored. Each issuer's buys are grouped across the scanned window and
scored:

| Component | Points |
|---|---|
| Combined purchase value ($1M / $500k / $250k / $100k tiers) | up to 30 |
| Distinct insiders buying (9 per insider) | up to 36 |
| Price proximity to 52-week low | up to 24 |
| CEO/CFO/COO/President among buyers | +5 |

Digest emails include only signals scoring 55+.

## Architecture

- `src/lib/edgar.ts` — EDGAR daily master index → Form 4 wrapper .txt → XML parse
  (rate-limited to ~8 req/s with retries; SEC requires a User-Agent)
- `src/lib/prices.ts` — Yahoo Finance chart API for price + 52-week context
- `src/lib/scoring.ts` — conviction scoring rubric
- `scripts/review.ts` — CLI to inspect raw signal quality before emailing anyone
- `scripts/ingest.ts` — nightly pipeline: scan → score → upsert `daily_signals`
  → optionally notify the digest endpoint (`DIGEST_NOTIFY_URL` + `CRON_SECRET`)
- `.github/workflows/ingest.yml` — scheduled ingest runner (10:00 UTC Tue–Sat)
- `supabase/migration.sql` — subscribers, daily_signals, digest_log tables
  (RLS on, service-role writes only)
- `/api/subscribe` + `/api/confirm` — double opt-in
- `/api/cron/digest` — sends digests (Pro daily, Free Mondays); protect with
  `CRON_SECRET` bearer token
- `/api/webhooks/lemonsqueezy` — HMAC-verified checkout webhook upgrades/downgrades plans

## Environment

See `.env.local.example`. Email via Resend (`RESEND_API_KEY`,
`DIGEST_FROM_EMAIL`). Payments via Lemon Squeezy
(`LEMON_SQUEEZY_WEBHOOK_SECRET`; pass buyer email as `custom_data.email`).

## Legal notes

Data-only positioning, disclaimers in every email, double opt-in +
one-click unsubscribe. Consult counsel before scaling paid subscriptions.
