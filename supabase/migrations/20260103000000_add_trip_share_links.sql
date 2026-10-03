-- Shareable trip links. Applied to production.

alter table public.trips
  add column if not exists share_token text,
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_role text not null default 'viewer',
  add column if not exists share_expires_at timestamptz;

alter table public.trips
  drop constraint if exists trips_share_role_check;

alter table public.trips
  add constraint trips_share_role_check check (share_role in ('viewer', 'editor'));

create unique index if not exists trips_share_token_key
  on public.trips (share_token)
  where share_token is not null;
