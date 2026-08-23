create extension if not exists pgcrypto;

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending' check (status in ('pending','active','unsubscribed')),
  plan text not null default 'free' check (plan in ('free','pro')),
  confirm_token uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index subscribers_email_lower_idx on public.subscribers (lower(email));

create table public.daily_signals (
  id uuid primary key default gen_random_uuid(),
  signal_date date not null,
  issuer_cik text not null,
  issuer_name text not null,
  ticker text,
  score integer not null,
  insider_count integer not null,
  total_value_usd numeric(14,2) not null,
  pct_from_low numeric(7,2),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (signal_date, issuer_cik)
);

create index daily_signals_date_score_idx on public.daily_signals (signal_date, score desc);

create table public.digest_log (
  id uuid primary key default gen_random_uuid(),
  sent_date date not null,
  audience text not null check (audience in ('free','pro')),
  subject text not null,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;
alter table public.daily_signals enable row level security;
alter table public.digest_log enable row level security;

-- v2: forward-return outcome tracking
create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  signal_date date not null,
  issuer_cik text not null,
  ticker text,
  base_price numeric(12,4),
  ret_7d numeric(8,3),
  ret_30d numeric(8,3),
  ret_90d numeric(8,3),
  updated_at timestamptz not null default now(),
  unique (signal_date, issuer_cik)
);

create index if not exists signal_outcomes_date_idx on public.signal_outcomes (signal_date);

alter table public.signal_outcomes enable row level security;

-- v3: insider-level buy ledger (powers report cards & leaderboards)
create table if not exists public.insider_buys (
  id uuid primary key default gen_random_uuid(),
  signal_date date not null,
  traded_at date,
  issuer_cik text not null,
  ticker text,
  owner_name text not null,
  owner_cik text,
  role text,
  shares numeric(16,2),
  price numeric(12,4),
  value_usd numeric(16,2),
  owned_after numeric(18,2),
  base_price numeric(12,4),
  created_at timestamptz not null default now(),
  unique (signal_date, issuer_cik, owner_name, traded_at)
);

create index if not exists insider_buys_owner_idx on public.insider_buys (lower(owner_name));
create index if not exists insider_buys_ticker_idx on public.insider_buys (ticker);
create index if not exists insider_buys_date_idx on public.insider_buys (signal_date);

alter table public.insider_buys enable row level security;

-- v4: filing dedup ledger
create table if not exists public.parsed_filings (
  accession text primary key,
  parsed_at timestamptz not null default now()
);
alter table public.parsed_filings enable row level security;
