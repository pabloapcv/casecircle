-- Reddit threads storage for Ask Reddit Q&A.
-- Stores ingested threads from r/USCIS, r/USCIS_FORUM, r/immigration, r/greencard.
-- Raw thread data is never exposed publicly; served only through the server API.
-- Author usernames are never stored (stripped at ingest time).

-- ───────────── reddit_threads table ─────────────

create table public.reddit_threads (
  id bigint generated always as identity primary key,
  
  -- Reddit metadata (no author info stored)
  reddit_id text not null unique check (reddit_id ~ '^[a-z0-9]{6,10}$'),
  subreddit text not null check (subreddit ~ '^[A-Za-z0-9_]{3,21}$'),
  permalink text not null check (permalink ~ '^/r/'),
  
  -- Content (author names stripped)
  title text not null check (char_length(title) between 1 and 500),
  selftext text not null default '' check (char_length(selftext) <= 10000),
  
  -- Top-level comments (author names stripped, max 5 stored)
  top_comments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(top_comments) = 'array' and pg_column_size(top_comments) <= 32768),
  
  -- Reddit scores
  score integer not null default 0,
  num_comments integer not null default 0,
  
  -- Timestamps
  created_utc timestamptz not null,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Extracted tags (for filtering)
  form_tags text[] not null default '{}',
  office_tags text[] not null default '{}',
  step_tags text[] not null default '{}',
  
  -- Full-text search vector
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(selftext, '')), 'B')
  ) stored
);

-- Indexes for efficient querying
create index reddit_threads_created_idx on public.reddit_threads (created_utc desc);
create index reddit_threads_subreddit_idx on public.reddit_threads (subreddit);
create index reddit_threads_search_idx on public.reddit_threads using gin (search_vector);
create index reddit_threads_form_tags_idx on public.reddit_threads using gin (form_tags);
create index reddit_threads_office_tags_idx on public.reddit_threads using gin (office_tags);
create index reddit_threads_step_tags_idx on public.reddit_threads using gin (step_tags);
create index reddit_threads_score_idx on public.reddit_threads (score desc);

-- Auto-update updated_at
create function private.reddit_threads_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger reddit_threads_updated_at before update on public.reddit_threads
  for each row execute function private.reddit_threads_updated_at();

revoke all on function private.reddit_threads_updated_at() from public, anon, authenticated;

-- ───────────── Ask Reddit usage tracking ─────────────

create table public.reddit_ask_usage (
  id bigint generated always as identity primary key,
  
  -- Identify the user (either IP hash for anonymous, or user_id for signed-in)
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  
  -- Question asked (for debugging, no PII)
  question_preview text not null check (char_length(question_preview) <= 100),
  
  -- Filters used
  form_filter text,
  office_filter text,
  step_filter text,
  
  -- Result metrics
  threads_used integer not null default 0,
  llm_used boolean not null default false,
  
  -- Timestamp
  created_at timestamptz not null default now(),
  
  -- One of ip_hash or user_id must be set
  check (ip_hash is not null or user_id is not null)
);

create index reddit_ask_usage_ip_day_idx on public.reddit_ask_usage (ip_hash, created_at desc) where ip_hash is not null;
create index reddit_ask_usage_user_day_idx on public.reddit_ask_usage (user_id, created_at desc) where user_id is not null;

-- ───────────── Ask Reddit feedback ─────────────

create table public.reddit_ask_feedback (
  id bigint generated always as identity primary key,
  
  -- IP hash (no personal data stored)
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  
  -- Feedback (counts only, no text)
  helpful boolean not null,
  
  -- Question hash to prevent duplicate feedback
  question_hash text not null check (question_hash ~ '^[a-f0-9]{64}$'),
  
  created_at timestamptz not null default now(),
  
  unique (ip_hash, question_hash)
);

create index reddit_ask_feedback_helpful_idx on public.reddit_ask_feedback (helpful);

-- ───────────── RLS + privileges ─────────────

revoke all on public.reddit_threads, public.reddit_ask_usage, public.reddit_ask_feedback from anon, authenticated;

alter table public.reddit_threads enable row level security;
alter table public.reddit_ask_usage enable row level security;
alter table public.reddit_ask_feedback enable row level security;

-- reddit_threads: no direct public access; served only through server API
-- Admins can read for debugging
create policy "admins read threads" on public.reddit_threads for select to authenticated
  using ((select private.is_admin()));

-- Admins can insert/update/delete for ingestion
grant insert, update, delete on public.reddit_threads to authenticated;

create policy "admins write threads" on public.reddit_threads for insert to authenticated
  with check ((select private.is_admin()));

create policy "admins update threads" on public.reddit_threads for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admins delete threads" on public.reddit_threads for delete to authenticated
  using ((select private.is_admin()));

-- reddit_ask_usage: server writes, admins read
grant insert on public.reddit_ask_usage to anon, authenticated;
grant select on public.reddit_ask_usage to authenticated;

create policy "anyone can log usage" on public.reddit_ask_usage for insert to anon, authenticated
  with check (true);

create policy "admins read usage" on public.reddit_ask_usage for select to authenticated
  using ((select private.is_admin()));

-- reddit_ask_feedback: anyone can insert (counts only), admins read
grant insert on public.reddit_ask_feedback to anon, authenticated;
grant select on public.reddit_ask_feedback to authenticated;

create policy "anyone can give feedback" on public.reddit_ask_feedback for insert to anon, authenticated
  with check (true);

create policy "admins read feedback" on public.reddit_ask_feedback for select to authenticated
  using ((select private.is_admin()));

-- ───────────── Search function for the API ─────────────

create or replace function public.search_reddit_threads(
  query text,
  form_filter text default null,
  office_filter text default null,
  step_filter text default null,
  max_results integer default 20
)
returns table (
  id bigint,
  reddit_id text,
  subreddit text,
  permalink text,
  title text,
  selftext text,
  top_comments jsonb,
  score integer,
  num_comments integer,
  created_utc timestamptz,
  form_tags text[],
  office_tags text[],
  step_tags text[],
  rank real
)
language sql stable security definer set search_path = ''
as $$
  select 
    t.id,
    t.reddit_id,
    t.subreddit,
    t.permalink,
    t.title,
    t.selftext,
    t.top_comments,
    t.score,
    t.num_comments,
    t.created_utc,
    t.form_tags,
    t.office_tags,
    t.step_tags,
    ts_rank(t.search_vector, websearch_to_tsquery('english', query)) as rank
  from public.reddit_threads t
  where 
    t.search_vector @@ websearch_to_tsquery('english', query)
    and (form_filter is null or form_filter = any(t.form_tags))
    and (office_filter is null or office_filter = any(t.office_tags))
    and (step_filter is null or step_filter = any(t.step_tags))
  order by 
    ts_rank(t.search_vector, websearch_to_tsquery('english', query)) desc,
    t.score desc,
    t.created_utc desc
  limit max_results;
$$;

grant execute on function public.search_reddit_threads(text, text, text, text, integer) to anon, authenticated;

-- ───────────── Count usage for rate limiting ─────────────

create or replace function public.count_reddit_ask_today(
  p_ip_hash text default null,
  p_user_id uuid default null
)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.reddit_ask_usage
  where 
    created_at > now() - interval '24 hours'
    and (
      (p_ip_hash is not null and ip_hash = p_ip_hash)
      or (p_user_id is not null and user_id = p_user_id)
    );
$$;

grant execute on function public.count_reddit_ask_today(text, uuid) to anon, authenticated;
