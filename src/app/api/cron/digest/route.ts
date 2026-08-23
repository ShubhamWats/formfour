import { NextResponse } from "next/server";
import { adminClient, supabaseConfigured } from "@/lib/supabase/admin";
import { renderDigestHtml, sendEmail } from "@/lib/email";
import type { IssuerSignal } from "@/types";

interface SignalRow {
  signal_date: string;
  issuer_name: string;
  details: IssuerSignal;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 501 },
    );
  }

  const supa = adminClient();
  const latest = await supa
    .from("daily_signals")
    .select("signal_date")
    .order("signal_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error || !latest.data) {
    return NextResponse.json({
      ok: true,
      note: "No signals stored yet — run the ingest pipeline first.",
    });
  }

  const signalDate = latest.data.signal_date as string;
  const rows = await supa
    .from("daily_signals")
    .select("signal_date,issuer_name,details")
    .eq("signal_date", signalDate)
    .gte("score", 55)
    .order("score", { ascending: false })
    .limit(10);

  if (rows.error) {
    return NextResponse.json({ error: rows.error.message }, { status: 500 });
  }
  const signals = (rows.data as SignalRow[]).map((r) => r.details);

  const isMonday = new Date().getUTCDay() === 1;
  const plans = isMonday ? ["free", "pro"] : ["pro"];
  const subs = await supa
    .from("subscribers")
    .select("email,plan,unsubscribe_token")
    .eq("status", "active")
    .in("plan", plans);

  if (subs.error) {
    return NextResponse.json({ error: subs.error.message }, { status: 500 });
  }

  const dateLabel = new Date(`${signalDate}T12:00:00Z`).toDateString();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  let sent = 0;
  for (const sub of subs.data) {
    const unsub = `${site}/api/unsubscribe?token=${sub.unsubscribe_token}`;
    const html = renderDigestHtml(signals, dateLabel, unsub);
    const tier = sub.plan === "pro" ? "Daily" : "Weekly";
    const result = await sendEmail(
      sub.email,
      `FormFour — top insider buys (${tier}) · ${dateLabel}`,
      html,
    );
    if (result.ok) sent++;
  }

  await supa.from("digest_log").insert({
    sent_date: new Date().toISOString().slice(0, 10),
    audience: isMonday ? "free" : "pro",
    subject: `FormFour digest ${signalDate}`,
    recipient_count: sent,
  });

  return NextResponse.json({
    ok: true,
    signal_date: signalDate,
    signals_included: signals.length,
    recipients: subs.data.length,
    sent,
  });
}
