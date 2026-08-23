"use client";

import { useSearchParams } from "next/navigation";

export default function ConfirmBanner() {
  const params = useSearchParams();

  if (params.get("confirmed") === "1") {
    return (
      <div className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-center text-sm text-emerald-300">
        Subscription confirmed — you&apos;re on the list. Your first digest lands Monday morning.
      </div>
    );
  }
  if (params.get("confirmed") === "0") {
    return (
      <div className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-red-400/30 bg-red-400/10 px-5 py-4 text-center text-sm text-red-300">
        That confirmation link didn&apos;t work or was already used. Try
        subscribing again below.
      </div>
    );
  }
  if (params.get("unsubscribed") === "1") {
    return (
      <div className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-center text-sm text-zinc-300">
        You&apos;ve been unsubscribed. Sorry to see you go.
      </div>
    );
  }
  return null;
}
