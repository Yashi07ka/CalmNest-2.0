-- CalmNest shared database
-- Run this once in the Supabase SQL editor for the project CalmNest and
-- Little Universe will share. It does not create any Little Universe tables.
-- The service-role key is not used by the website. These policies let a
-- signed-in person read and write only their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.calmnest_diary_entries (
  id text not null check (char_length(id) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  mood text not null check (mood in ('joyful', 'calm', 'hopeful', 'tired', 'anxious', 'low')),
  title text not null default '',
  body text not null default '',
  stickers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.calmnest_collections (
  id text not null check (char_length(id) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  accent text not null check (accent in ('sky', 'butter', 'pink', 'sage')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.calmnest_collection_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection_id text not null,
  entry_id text not null,
  primary key (user_id, collection_id, entry_id),
  constraint calmnest_collection_entries_collection_fk
    foreign key (user_id, collection_id)
    references public.calmnest_collections (user_id, id)
    on delete cascade,
  constraint calmnest_collection_entries_entry_fk
    foreign key (user_id, entry_id)
    references public.calmnest_diary_entries (user_id, id)
    on delete cascade
);

create table if not exists public.calmnest_scenes (
  id text not null check (char_length(id) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  preset text not null check (preset in ('forest', 'ocean', 'mountains')),
  mood text not null check (mood in ('morning', 'sunset', 'rainy')),
  has_custom_image boolean not null default false,
  saved_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.profiles enable row level security;
alter table public.calmnest_diary_entries enable row level security;
alter table public.calmnest_collections enable row level security;
alter table public.calmnest_collection_entries enable row level security;
alter table public.calmnest_scenes enable row level security;

create or replace function public.calmnest_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists calmnest_on_auth_user_created on auth.users;
create trigger calmnest_on_auth_user_created
  after insert on auth.users
  for each row execute function public.calmnest_handle_new_user();

revoke all on table public.profiles from anon, public;
revoke all on table public.calmnest_diary_entries from anon, public;
revoke all on table public.calmnest_collections from anon, public;
revoke all on table public.calmnest_collection_entries from anon, public;
revoke all on table public.calmnest_scenes from anon, public;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.calmnest_diary_entries to authenticated;
grant select, insert, update, delete on table public.calmnest_collections to authenticated;
grant select, insert, update, delete on table public.calmnest_collection_entries to authenticated;
grant select, insert, update, delete on table public.calmnest_scenes to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "diary_entries_own" on public.calmnest_diary_entries;
create policy "diary_entries_own"
  on public.calmnest_diary_entries for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "collections_own" on public.calmnest_collections;
create policy "collections_own"
  on public.calmnest_collections for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "collection_entries_own" on public.calmnest_collection_entries;
create policy "collection_entries_own"
  on public.calmnest_collection_entries for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scenes_own" on public.calmnest_scenes;
create policy "scenes_own"
  on public.calmnest_scenes for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
