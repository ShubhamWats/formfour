"use client";

import { useState } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setStatus("done");
      setMessage(data.message ?? "Check your inbox to confirm.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="h-12 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-400/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="h-12 rounded-lg bg-emerald-400 px-6 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
      >
        {status === "loading" ? "Signing up…" : "Get free weekly alerts"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400">{message}</p>
      )}
    </form>
  );
}
