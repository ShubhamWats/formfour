import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { renderConfirmHtml, sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  let devNote: string | undefined;
  try {
    const supa = adminClient();
    const existing = await supa
      .from("subscribers")
      .select("id,status,confirm_token")
      .eq("email", email)
      .maybeSingle();

    if (existing.data?.status === "active") {
      return NextResponse.json({
        ok: true,
        message: "You're already on the list.",
      });
    }

    let token: string;
    if (existing.data) {
      token = existing.data.confirm_token as string;
    } else {
      const inserted = await supa
        .from("subscribers")
        .insert({ email })
        .select("confirm_token")
        .single();
      if (inserted.error || !inserted.data) throw inserted.error;
      token = inserted.data.confirm_token as string;
    }

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
    const confirmUrl = `${site}/api/confirm?token=${token}`;
    const sent = await sendEmail(
      email,
      "Confirm your FormFour subscription",
      renderConfirmHtml(confirmUrl),
    );
    if (sent.skipped) {
      devNote =
        "Email sending is not configured yet (set RESEND_API_KEY). Your address was saved.";
    } else if (!sent.ok) {
      return NextResponse.json(
        { error: "Could not send confirmation email. Try again later." },
        { status: 502 },
      );
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[subscribe]", err);
      devNote = `Dev mode: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Check your inbox to confirm.",
    devNote,
  });
}
