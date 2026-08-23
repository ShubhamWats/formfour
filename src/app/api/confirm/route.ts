import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const token = url.searchParams.get("token") ?? "";
  const ok = UUID_RE.test(token);

  if (ok) {
    try {
      const supa = adminClient();
      const updated = await supa
        .from("subscribers")
        .update({ status: "active", confirmed_at: new Date().toISOString() })
        .eq("confirm_token", token)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (updated.error || !updated.data) {
        return NextResponse.redirect(`${site}/?confirmed=0`, 303);
      }
    } catch {
      return NextResponse.redirect(`${site}/?confirmed=0`, 303);
    }
  }

  return NextResponse.redirect(`${site}/?confirmed=${ok ? 1 : 0}`, 303);
}
