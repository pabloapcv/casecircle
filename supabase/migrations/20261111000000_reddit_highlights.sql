-- This week on Reddit / Esta semana en Reddit: curated highlights from immigration subreddits.
-- A daily routine writes paraphrased summaries; this table stores them for display on the community page.
-- RLS: public can read only published rows; only admins (accounts.is_admin) can write.

create table public.reddit_highlights (
  id bigint generated always as identity primary key,
  
  -- Bilingual content (EN/ES)
  title_en text not null check (char_length(title_en) between 5 and 200),
  title_es text not null check (char_length(title_es) between 5 and 200),
  story_en text not null check (char_length(story_en) between 10 and 2000),
  story_es text not null check (char_length(story_es) between 10 and 2000),
  insight_en text not null check (char_length(insight_en) between 5 and 500),
  insight_es text not null check (char_length(insight_es) between 5 and 500),
  mood_en text not null check (char_length(mood_en) between 3 and 300),
  mood_es text not null check (char_length(mood_es) between 3 and 300),
  
  -- Categorization
  mood_tag text not null check (mood_tag in ('approval', 'delay', 'rfe', 'interview', 'civics', 'rules', 'tip', 'warning', 'success', 'question')),
  form_type text check (form_type is null or form_type ~ '^[A-Z]{1,3}-[0-9]{2,4}[A-Z]?$'),
  subreddit text not null check (subreddit ~ '^[A-Za-z0-9_]{3,21}$'),
  thread_url text not null check (thread_url ~ '^https://'),
  
  -- Status and timestamps
  post_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for listing highlights by date, showing published ones first
create index reddit_highlights_published_idx on public.reddit_highlights (status, post_date desc);
create index reddit_highlights_form_idx on public.reddit_highlights (form_type) where form_type is not null;

-- Weekly trends note (small table, one row per week)
create table public.reddit_weekly_trends (
  id bigint generated always as identity primary key,
  week_start date not null unique,
  
  -- Bilingual trend summary
  trends_en text not null check (char_length(trends_en) between 10 and 500),
  trends_es text not null check (char_length(trends_es) between 10 and 500),
  
  status text not null default 'draft' check (status in ('draft', 'published')),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reddit_weekly_trends_published_idx on public.reddit_weekly_trends (status, week_start desc);

-- Auto-update updated_at
create function private.reddit_highlights_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger reddit_highlights_updated_at before update on public.reddit_highlights
  for each row execute function private.reddit_highlights_updated_at();

create trigger reddit_weekly_trends_updated_at before update on public.reddit_weekly_trends
  for each row execute function private.reddit_highlights_updated_at();

revoke all on function private.reddit_highlights_updated_at() from public, anon, authenticated;

-- ───────────── RLS + privileges ─────────────

revoke all on public.reddit_highlights, public.reddit_weekly_trends from anon, authenticated;

alter table public.reddit_highlights enable row level security;
alter table public.reddit_weekly_trends enable row level security;

-- Public can read only published rows
grant select on public.reddit_highlights to anon, authenticated;
grant select on public.reddit_weekly_trends to anon, authenticated;

create policy "read published highlights" on public.reddit_highlights for select to anon, authenticated
  using (status = 'published');

create policy "read published trends" on public.reddit_weekly_trends for select to anon, authenticated
  using (status = 'published');

-- Admins can read all rows (including drafts) for admin view
create policy "admins read all highlights" on public.reddit_highlights for select to authenticated
  using ((select private.is_admin()));

create policy "admins read all trends" on public.reddit_weekly_trends for select to authenticated
  using ((select private.is_admin()));

-- Admins can insert/update/delete
grant insert, update, delete on public.reddit_highlights to authenticated;
grant insert, update, delete on public.reddit_weekly_trends to authenticated;

create policy "admins write highlights" on public.reddit_highlights for insert to authenticated
  with check ((select private.is_admin()));

create policy "admins update highlights" on public.reddit_highlights for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admins delete highlights" on public.reddit_highlights for delete to authenticated
  using ((select private.is_admin()));

create policy "admins write trends" on public.reddit_weekly_trends for insert to authenticated
  with check ((select private.is_admin()));

create policy "admins update trends" on public.reddit_weekly_trends for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admins delete trends" on public.reddit_weekly_trends for delete to authenticated
  using ((select private.is_admin()));
