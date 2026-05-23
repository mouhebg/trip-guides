create extension if not exists pgcrypto;

create table if not exists public.user_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  slug text not null,
  title text not null,
  destination text,
  guide_url text,
  source text not null default 'built_in' check (source in ('built_in', 'ai')),
  saved boolean not null default true,
  visited boolean not null default false,
  visited_at timestamptz,
  guide_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_trips_set_updated_at on public.user_trips;
create trigger user_trips_set_updated_at
before update on public.user_trips
for each row execute function public.set_updated_at();

alter table public.user_trips enable row level security;

drop policy if exists "Users can read own trips" on public.user_trips;
drop policy if exists "Users can insert own trips" on public.user_trips;
drop policy if exists "Users can update own trips" on public.user_trips;
drop policy if exists "Users can delete own trips" on public.user_trips;

create policy "Users can read own trips"
on public.user_trips
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own trips"
on public.user_trips
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own trips"
on public.user_trips
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own trips"
on public.user_trips
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.user_trips from anon;
grant select, insert, update, delete on public.user_trips to authenticated;
