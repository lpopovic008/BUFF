-- Run this once in the Supabase SQL Editor (dashboard -> SQL Editor -> New
-- query) for this project. There is no tool in this repo's CI/CD that can
-- run migrations against Supabase automatically, so this file is applied by
-- hand, same as the free-tier services elsewhere in this project (Render,
-- the Supabase project itself) needed a one-time dashboard action.
--
-- One row per signed-in user, holding the exact JSON blob
-- src/lib/localStore.ts's exportAllData()/importAllData() already produce
-- and consume — this is a near drop-in replacement for what
-- google-drive-sync.ts used to keep in a hidden Google Drive file, just
-- backed by Postgres and gated by a real account instead of a Drive OAuth
-- token. See docs/architecture.md for why this stays a single jsonb blob
-- instead of normalized tables (nothing today needs cross-user/cross-league
-- queries — if that changes, this table migrates cleanly since it already
-- holds the whole shape).
create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

-- Every policy is scoped to auth.uid() = user_id — a signed-in user can
-- only ever read or write their own row. Nobody, including this app's own
-- publishable key holder, can read another user's data; the anon/public
-- key has no privileges beyond what these policies grant.
create policy "select own row" on public.app_data
  for select using (auth.uid() = user_id);

create policy "insert own row" on public.app_data
  for insert with check (auth.uid() = user_id);

create policy "update own row" on public.app_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
