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

-- Suggestions for the app (Settings → Suggest an improvement). Anyone can
-- send one, signed in or not; nobody can read them back through the app —
-- there's no select policy, so only the project owner sees them, in the
-- dashboard (Table Editor → suggestions). Each is held to 2,000 characters
-- (as the form is, see src/lib/support.ts), and a signed-in sender's id is
-- kept with it.
create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) between 1 and 2000),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

create policy "anyone can send a suggestion" on public.suggestions
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
