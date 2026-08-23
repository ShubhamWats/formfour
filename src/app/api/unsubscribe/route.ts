import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const token = url.searchParams.get("token") ?? "";

  if (UUID_RE.test(token)) {
    try {
      const supa = adminClient();
      await supa
        .from("subscribers")
        .update({ status: "unsubscribed" })
        .eq("unsubscribe_token", token);
    } catch {
      return NextResponse.redirect(`${site}/?unsubscribed=0`, 303);
    }
  }
  return NextResponse.redirect(`${site}/?unsubscribed=1`, 303);
}
