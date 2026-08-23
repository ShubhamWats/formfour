export function restConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function restSelect<T>(
  table: string,
  query: string,
): Promise<T[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: headers(key),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`REST select ${table}: HTTP ${res.status}`);
  return (await res.json()) as T[];
}

export async function restUpsert(
  table: string,
  rows: unknown[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  const res = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: { ...headers(key), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`REST upsert ${table}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
}
