-- SocialFrame v2 — initial schema
-- Run this in Supabase SQL editor (or via `supabase db push` if you use the CLI).

create table if not exists public.designs (
  id text primary key,
  platform_id text,
  format_id text,
  content jsonb,
  style jsonb,
  date text,
  created_at timestamptz default now()
);

create table if not exists public.brand_kits (
  id text primary key,
  name text,
  sender_name text,
  url text,
  verified boolean default false,
  avatar jsonb,
  created_at timestamptz default now()
);

-- Lock down direct access. Only the Edge Function (which runs with the
-- service-role key) can read/write. Anon/authenticated clients get nothing
-- when calling PostgREST directly — they have to go through the password-gated
-- Edge Function instead.
alter table public.designs   enable row level security;
alter table public.brand_kits enable row level security;
