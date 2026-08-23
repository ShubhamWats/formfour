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
