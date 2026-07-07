-- =============================================
-- Tierra Rejada Golf Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor
-- =============================================

create extension if not exists "pgcrypto";

-- ----------------------
-- Tables
-- ----------------------

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  date        date not null default current_date,
  status      text not null default 'setup' check (status in ('setup', 'active', 'completed')),
  created_at  timestamptz not null default now()
);

create table public.foursomes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds(id) on delete cascade,
  group_number  int not null check (group_number between 1 and 3)
);

create table public.players (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds(id) on delete cascade,
  name            text not null,
  handicap_index  numeric(4,1) not null default 0,
  foursome_id     uuid references public.foursomes(id) on delete set null,
  vegas_team      int check (vegas_team in (1, 2)),
  created_at      timestamptz not null default now()
);

create table public.scores (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  hole_number  int not null check (hole_number between 1 and 18),
  gross_score  int not null check (gross_score > 0 and gross_score < 20),
  updated_at   timestamptz not null default now(),
  unique (player_id, hole_number)
);

-- ----------------------
-- Realtime
-- ----------------------

alter publication supabase_realtime add table public.scores;
alter publication supabase_realtime add table public.players;

-- ----------------------
-- Row Level Security
-- (open read, open write — pin-free for day-of simplicity)
-- ----------------------

alter table public.rounds   enable row level security;
alter table public.foursomes enable row level security;
alter table public.players  enable row level security;
alter table public.scores   enable row level security;

create policy "Public read rounds"    on public.rounds    for select using (true);
create policy "Public read foursomes" on public.foursomes for select using (true);
create policy "Public read players"   on public.players   for select using (true);
create policy "Public read scores"    on public.scores    for select using (true);

create policy "Public write rounds"    on public.rounds    for insert with check (true);
create policy "Public write foursomes" on public.foursomes for insert with check (true);
create policy "Public write players"   on public.players   for insert with check (true);
create policy "Public write scores"    on public.scores    for insert with check (true);

create policy "Public update players" on public.players for update using (true);
create policy "Public update scores"  on public.scores  for update using (true);

-- ----------------------
-- Seed: July 11 Round + 12 Players
-- (run after creating the round manually or uncomment below)
-- ----------------------

-- INSERT INTO public.rounds (date, status) VALUES ('2026-07-11', 'setup')
-- RETURNING id;
--
-- Then insert players with that round_id.
-- The app's /setup page handles this automatically via the "Initialize Round" button.
