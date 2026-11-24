-- Push notifications (see supabase/functions/notify and docs/app-store.md). Run once in the Supabase SQL Editor,
-- after schema.sql — then the two lines at the bottom with your own secret.

-- Each phone or iPad that's turned notifications on: its Apple device token, whose account it's signed in to, and which
-- kinds of notification it wants. Its owner alone can see or change it; the app registers it through
-- register_push_device (below), which also moves a device to whoever's signed in on it now.
create table if not exists public.push_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios',
  prefs jsonb not null default '{"scoring": true, "lineup": true, "results": true, "trades": true}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_devices enable row level security;

create policy "select own devices" on public.push_devices for select using (auth.uid() = user_id);
create policy "delete own devices" on public.push_devices for delete using (auth.uid() = user_id);

create or replace function public.register_push_device(device_token text, device_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.push_devices (token, user_id, prefs, updated_at)
  values (device_token, auth.uid(), device_prefs, now())
  on conflict (token) do update set user_id = auth.uid(), prefs = excluded.prefs, updated_at = now();
end;
$$;

revoke all on function public.register_push_device(text, jsonb) from public;
grant execute on function public.register_push_device(text, jsonb) to authenticated;

-- What's been sent to whom (each notification's key, see notify/logic.ts), so nothing's sent twice. The notify
-- function's alone: no policies, so no one else can read or write it.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_sent enable row level security;

-- Every NFL player's name, position, team and injury, from Sleeper, kept by the notify function (refreshed hourly):
-- what it needs to know about your starters without fetching Sleeper's whole list every minute.
create table if not exists public.nfl_players (
  id text primary key,
  name text not null,
  position text not null,
  team text,
  injury text,
  updated_at timestamptz not null default now()
);

alter table public.nfl_players enable row level security;

-- Old sends forgotten after a month.
create or replace function public.forget_old_push_sent() returns void language sql as $$
  delete from public.push_sent where sent_at < now() - interval '30 days';
$$;

-- The notify function, run every minute. It answers only with the secret it's set up with (its NOTIFY_SECRET), kept
-- here in Supabase's vault. Replace the secret below with a long random string of your own — the same one you give
-- the function as NOTIFY_SECRET — then run these lines.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-STRING', 'notify_secret');

select cron.schedule(
  'league-notify',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://uybcjhzfwidbetnzfxwu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule('forget-old-push-sent', '17 4 * * *', $$ select public.forget_old_push_sent(); $$);
