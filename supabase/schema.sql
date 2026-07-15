create table if not exists public.user_terms (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.review_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  term_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, term_id)
);

create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.review_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  payload jsonb not null,
  reviewed_at timestamptz not null,
  primary key (user_id, client_id)
);

alter table public.user_terms enable row level security;
alter table public.review_progress enable row level security;
alter table public.user_settings enable row level security;
alter table public.review_activity enable row level security;

create policy "users manage own terms" on public.user_terms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own progress" on public.review_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own activity" on public.review_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
