import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient, supabaseConfigured } from "@/lib/supabase/admin";

interface LsPayload {
  meta?: {
    event_name?: string;
    custom_data?: { email?: string };
  };
  data?: {
    attributes?: {
      status?: string;
      user_email?: string;
    };
  };
}

function verifySignature(raw: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(digest);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function applyPlan(email: string, plan: "free" | "pro"): Promise<void> {
  const supa = adminClient();
  const updated = await supa
    .from("subscribers")
    .update({ plan })
    .eq("email", email)
    .select("id")
    .maybeSingle();
  if (!updated.data) {
    await supa
      .from("subscribers")
      .upsert({ email, status: "active", confirmed_at: new Date().toISOString(), plan });
  }
}

export async function POST(req: Request) {
  if (!process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || !supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 501 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-signature") ?? "";
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LsPayload;
  try {
    payload = JSON.parse(raw) as LsPayload;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const event = payload.meta?.event_name ?? "";
  const email = (
    payload.meta?.custom_data?.email ??
    payload.data?.attributes?.user_email ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!email) return NextResponse.json({ received: true });

  try {
    if (event === "subscription_created" || event === "order_created") {
      await applyPlan(email, "pro");
    } else if (event === "subscription_updated") {
      const status = payload.data?.attributes?.status ?? "";
      await applyPlan(email, status === "active" ? "pro" : "free");
    } else if (
      event === "subscription_expired" ||
      event === "subscription_payment_failed" ||
      event === "subscription_payment_refunded"
    ) {
      await applyPlan(email, "free");
    }
  } catch (err) {
    console.error("[lemonsqueezy webhook]", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
