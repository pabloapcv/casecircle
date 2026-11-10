-- CaseCircle on Supabase: accounts (Supabase Auth), community, Case Pass waitlist.
-- Every public table has RLS on. The browser never talks to Supabase directly: the Python server calls
-- Supabase Auth + PostgREST with the publishable key and the signed-in user's JWT, so these policies are the
-- real boundary (anyone with the public key and their own password could call PostgREST directly).
-- Counters (votes, reply counts, reputation, member counts) are kept by SECURITY DEFINER triggers in the
-- unexposed `private` schema; users can only write the columns granted below.

create extension if not exists unaccent with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ───────────── helpers ─────────────

create function private.spaces_ok(items text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(s ~ '^[a-z0-9][a-z0-9-]{1,23}$'), true) from unnest(items) as s
$$;

-- Same rules as community.evaluate() / logic.js evaluate(): block identifiers and abuse, hold likely scams.
create function private.moderate(input text) returns text
language plpgsql stable set search_path = '' as $$
declare
  raw text := coalesce(input, '');
  folded text := lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, '')));
  words text[] := array['fuck','fucking','fucker','shit','bullshit','bitch','asshole','cunt','nigger','nigga',
    'faggot','retard','slut','whore','puta','puto','mierda','cabron','maricon','pendejo','gilipollas','kys'];
  scams text[] := array['pay to expedite','pay me to expedite','expedite fee','gift card','whatsapp me',
    'message me on whatsapp','text me on whatsapp','wa.me','notario','guaranteed approval','western union',
    'moneygram','zelle me','cash app me','venmo me','wire transfer','i prepare forms for',
    'we prepare your forms for','form preparation for $','dm me for a fee','send bitcoin','crypto payment'];
  phrase text;
begin
  if raw ~* '\y[a-z]{3}(?:[-\s]*\d){10}\y' or folded ~* '\y[a-z]{3}(?:[-\s]*\d){10}\y' then return 'block:receipt'; end if;
  if raw ~* '\y(?:a[-\s]?number|alien\s+number|a#)\y[-\s:]*\d{7,9}\y' or raw ~ '\yA[-\s]?\d{8,9}\y' then return 'block:a-number'; end if;
  if raw ~ '\y\d{3}[-\s]\d{2}[-\s]\d{4}\y'
     or raw ~* '\y(?:ssn|social\s+security)\y(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*\d{3}-?\d{2}-?\d{4}\y' then
    return 'block:ssn';
  end if;
  if raw ~* '\y(?:passport|pasaporte)\y(?:\s*(?:number|no\.?|num(?:ero)?|#))?\s*[:#-]?\s*(?=[a-z0-9]*\d)[a-z0-9]{6,12}\y' then
    return 'block:passport';
  end if;
  if position('kill yourself' in folded) > 0 or folded ~ ('\y(?:' || array_to_string(words, '|') || ')\y') then
    return 'block:abuse';
  end if;
  foreach phrase in array scams loop
    if position(phrase in folded) > 0 then return 'hold:scam'; end if;
  end loop;
  return 'allow';
end $$;

-- ───────────── tables ─────────────

create table public.profiles (               -- public face of an account (author handle + reputation)
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null check (handle ~ '^[A-Za-z0-9_]{3,20}$'),
  handle_key text generated always as (lower(handle)) stored unique,
  reputation integer not null default 0 check (reputation >= 0),
  created_at timestamptz not null default now()
);

create table public.accounts (               -- private settings; only the owner can read it
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'es')),
  spaces text[] not null default '{}' check (cardinality(spaces) <= 12 and private.spaces_ok(spaces)),
  case_profiles jsonb not null default '[]'::jsonb
    check (jsonb_typeof(case_profiles) = 'array' and pg_column_size(case_profiles) <= 16384),
  is_admin boolean not null default false,   -- set only with SQL (never by the user)
  trial_started_at timestamptz not null default now(),
  pass_until timestamptz,                    -- hook for a real payment provider later
  created_at timestamptz not null default now()
);

create table public.space_counts (           -- members per group, kept by a trigger on accounts.spaces
  space_id text primary key,
  members integer not null default 0 check (members >= 0)
);

create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  type text not null check (type in ('question', 'timeline', 'interview', 'tip', 'vent')),
  title text not null check (char_length(title) between 8 and 140),
  body text not null check (char_length(body) between 20 and 5000),
  spaces text[] not null check (cardinality(spaces) between 1 and 3 and private.spaces_ok(spaces)),
  stage text not null default '' check (stage in ('', 'filed', 'biometrics', 'rfe', 'interview_scheduled',
    'interview_done', 'approved', 'denied', 'oath')),
  office_id text not null default '' check (char_length(office_id) <= 24),
  form text not null default '' check (char_length(form) <= 16),
  filed text check (filed is null or char_length(filed) <= 40),
  status text not null default 'live' check (status in ('live', 'held', 'hidden', 'removed')),
  held_reason text not null default '',
  helpful_comment_id bigint,
  votes integer not null default 0 check (votes >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  created_at timestamptz not null default now(),
  check (type not in ('timeline', 'interview') or stage <> '')
);

create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 8 and 3000),
  status text not null default 'live' check (status in ('live', 'held', 'hidden', 'removed')),
  votes integer not null default 0 check (votes >= 0),
  created_at timestamptz not null default now()
);
alter table public.posts add constraint posts_helpful_comment_fk
  foreign key (helpful_comment_id) references public.comments(id) on delete set null;

create table public.votes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment')),
  target_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);

create table public.saves (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid default auth.uid() references auth.users(id) on delete set null,
  target_kind text not null check (target_kind in ('post', 'comment')),
  target_id bigint not null,
  reason text not null default 'other' check (reason in ('spam', 'identifiers', 'scam', 'abuse', 'other')),
  state text not null default 'open' check (state in ('open', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);

create table public.waitlist (               -- Case Pass waitlist (write-only for the public)
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and char_length(email) <= 254
    and email ~ '^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\.]+(\.[^\s@<>(),;:"\[\]\\.]+)+$'),
  lang text not null default 'en' check (lang in ('en', 'es')),
  source text not null default '' check (source ~ '^[a-z0-9_-]{0,40}$'),
  created_at timestamptz not null default now()
);

create index posts_created_idx on public.posts (created_at desc);
create index posts_spaces_idx on public.posts using gin (spaces);
create index posts_author_idx on public.posts (author_id);
create index posts_helpful_idx on public.posts (helpful_comment_id);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id);
create index votes_target_idx on public.votes (target_kind, target_id);
create index saves_post_idx on public.saves (post_id);
create index reports_target_idx on public.reports (target_kind, target_id, state);

-- ───────────── admin check (after accounts exists) ─────────────

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.is_admin from public.accounts a where a.user_id = (select auth.uid())), false)
$$;

-- ───────────── triggers ─────────────

-- New Supabase Auth user -> profile + private account row. The trial starts at account creation.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := meta ->> 'handle';
  reserved text[] := array['uscis','dhs','ice','cbp','official','admin','moderator','notario','casecircle',
    'support','deleted','apple','google'];
  picked text[];
begin
  if wanted is null or wanted = '' then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);   -- e.g. users made in the dashboard
  elsif wanted !~ '^[A-Za-z0-9_]{3,20}$' or lower(wanted) = any(reserved)
        or exists (select 1 from unnest(string_to_array(lower(wanted), '_')) p where p = any(reserved)) then
    raise exception 'cc:invalid' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct s), '{}') into picked from (
    select s from jsonb_array_elements_text(case when jsonb_typeof(meta -> 'spaces') = 'array'
      then meta -> 'spaces' else '[]'::jsonb end) as s
    where s ~ '^[a-z0-9][a-z0-9-]{1,23}$' limit 12) q;
  if cardinality(picked) = 0 then picked := array['i-485']; end if;
  insert into public.profiles (id, handle, created_at) values (new.id, wanted, new.created_at);
  insert into public.accounts (user_id, locale, spaces, trial_started_at, created_at)
    values (new.id, case when meta ->> 'locale' = 'es' then 'es' else 'en' end, picked, new.created_at, new.created_at);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.sync_space_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    foreach s in array old.spaces loop
      if tg_op = 'DELETE' or not (s = any(new.spaces)) then
        update public.space_counts set members = greatest(0, members - 1) where space_id = s;
      end if;
    end loop;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    foreach s in array new.spaces loop
      if tg_op = 'INSERT' or not (s = any(old.spaces)) then
        insert into public.space_counts (space_id, members) values (s, 1)
          on conflict (space_id) do update set members = public.space_counts.members + 1;
      end if;
    end loop;
  end if;
  return null;
end $$;
create trigger accounts_space_counts after insert or delete or update of spaces on public.accounts
  for each row execute function private.sync_space_counts();

-- Deleting your own accounts row deletes your Supabase Auth user (posts stay, author removed).
create function private.delete_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 1 then          -- a direct delete by the owner, not the cascade from auth.users
    delete from auth.users where id = old.user_id;
  end if;
  return null;
end $$;
create trigger accounts_delete_auth_user after delete on public.accounts
  for each row execute function private.delete_auth_user();

-- Posts: the author is always the caller, moderation and rate limits run in the database too.
create function private.posts_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare verdict text; uid uuid := (select auth.uid());
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if uid is null then raise exception 'cc:auth' using errcode = 'P0001'; end if;
  verdict := private.moderate(new.title || chr(10) || new.body);
  if verdict like 'block:%' then raise exception 'cc:%', substr(verdict, 7) using errcode = 'P0001'; end if;
  if exists (select 1 from public.posts where author_id = uid and created_at > now() - interval '30 seconds')
     or (select count(*) from public.posts where author_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'cc:rate' using errcode = 'P0001';
  end if;
  new.author_id := uid;
  new.status := case when verdict = 'hold:scam' then 'held' else 'live' end;
  new.held_reason := case when verdict = 'hold:scam' then 'scam' else '' end;
  new.helpful_comment_id := null; new.votes := 0; new.reply_count := 0; new.created_at := now();
  return new;
end $$;
create trigger posts_before_insert before insert on public.posts
  for each row execute function private.posts_before_insert();

create function private.posts_before_update() returns trigger
language plpgsql set search_path = '' as $$
declare verdict text; uid uuid := (select auth.uid()); admin boolean := private.is_admin();
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.status is distinct from old.status and not admin then
    raise exception 'cc:auth' using errcode = 'P0001';
  end if;
  if new.title is distinct from old.title or new.body is distinct from old.body then
    if old.author_id is distinct from uid then raise exception 'cc:auth' using errcode = 'P0001'; end if;
    verdict := private.moderate(new.title || chr(10) || new.body);
    if verdict like 'block:%' then raise exception 'cc:%', substr(verdict, 7) using errcode = 'P0001'; end if;
    if verdict = 'hold:scam' and new.status = 'live' then new.status := 'held'; new.held_reason := 'scam'; end if;
  end if;
  if new.helpful_comment_id is distinct from old.helpful_comment_id then
    if old.author_id is distinct from uid or old.type <> 'question' then
      raise exception 'cc:auth' using errcode = 'P0001';
    end if;
    if new.helpful_comment_id is not null and not exists (
        select 1 from public.comments c where c.id = new.helpful_comment_id and c.post_id = old.id
          and c.status = 'live' and c.author_id is distinct from uid) then
      raise exception 'cc:auth' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger posts_before_update before update on public.posts
  for each row execute function private.posts_before_update();

create function private.posts_after_helpful() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid;
begin
  if old.helpful_comment_id is not null then
    select author_id into who from public.comments where id = old.helpful_comment_id;
    update public.profiles set reputation = greatest(0, reputation - 10) where id = who;
  end if;
  if new.helpful_comment_id is not null then
    select author_id into who from public.comments where id = new.helpful_comment_id;
    update public.profiles set reputation = reputation + 10 where id = who;
  end if;
  return null;
end $$;
create trigger posts_after_helpful after update of helpful_comment_id on public.posts
  for each row when (old.helpful_comment_id is distinct from new.helpful_comment_id)
  execute function private.posts_after_helpful();

create function private.comments_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare verdict text; uid uuid := (select auth.uid()); post_status text;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if uid is null then raise exception 'cc:auth' using errcode = 'P0001'; end if;
  select status into post_status from public.posts where id = new.post_id;   -- RLS: only posts you can see
  if post_status is null then raise exception 'cc:not_found' using errcode = 'P0001'; end if;
  if post_status <> 'live' then raise exception 'cc:closed' using errcode = 'P0001'; end if;
  verdict := private.moderate(new.body);
  if verdict like 'block:%' then raise exception 'cc:%', substr(verdict, 7) using errcode = 'P0001'; end if;
  if exists (select 1 from public.comments where author_id = uid and created_at > now() - interval '8 seconds')
     or (select count(*) from public.comments where author_id = uid and created_at > now() - interval '1 day') >= 200 then
    raise exception 'cc:rate' using errcode = 'P0001';
  end if;
  new.author_id := uid;
  new.status := case when verdict = 'hold:scam' then 'held' else 'live' end;
  new.votes := 0; new.created_at := now();
  return new;
end $$;
create trigger comments_before_insert before insert on public.comments
  for each row execute function private.comments_before_insert();

create function private.comments_reply_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'live' then update public.posts set reply_count = reply_count + 1 where id = new.post_id; end if;
  elsif old.status = 'live' and new.status <> 'live' then
    update public.posts set reply_count = greatest(0, reply_count - 1) where id = new.post_id;
  elsif old.status <> 'live' and new.status = 'live' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  end if;
  return null;
end $$;
create trigger comments_reply_count after insert or update of status on public.comments
  for each row execute function private.comments_reply_count();

create function private.votes_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_ public.votes := coalesce(new, old); delta integer := case when tg_op = 'INSERT' then 1 else -1 end; who uuid;
begin
  if row_.target_kind = 'post' then
    update public.posts set votes = greatest(0, votes + delta) where id = row_.target_id returning author_id into who;
  else
    update public.comments set votes = greatest(0, votes + delta) where id = row_.target_id returning author_id into who;
  end if;
  if who is not null then
    update public.profiles set reputation = greatest(0, reputation + delta) where id = who;
  end if;
  return null;
end $$;
create trigger votes_count after insert or delete on public.votes
  for each row execute function private.votes_count();

-- Hide a post or reply once it has 3 open reports (CASECIRCLE_REPORT_HIDE_THRESHOLD's default).
create function private.reports_threshold() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reports where target_kind = new.target_kind and target_id = new.target_id
      and state = 'open') >= 3 then
    if new.target_kind = 'post' then
      update public.posts set status = 'hidden' where id = new.target_id and status = 'live';
    else
      update public.comments set status = 'hidden' where id = new.target_id and status = 'live';
    end if;
  end if;
  return null;
end $$;
create trigger reports_threshold after insert on public.reports
  for each row execute function private.reports_threshold();

-- ───────────── privileges + RLS ─────────────

revoke all on function private.spaces_ok(text[]), private.moderate(text), private.is_admin() from public;
grant execute on function private.spaces_ok(text[]), private.moderate(text), private.is_admin() to anon, authenticated;
revoke all on function private.handle_new_user(), private.sync_space_counts(), private.delete_auth_user(),
  private.posts_before_insert(), private.posts_before_update(), private.posts_after_helpful(),
  private.comments_before_insert(), private.comments_reply_count(), private.votes_count(),
  private.reports_threshold() from public, anon, authenticated;

revoke all on public.profiles, public.accounts, public.space_counts, public.posts, public.comments,
  public.votes, public.saves, public.reports, public.waitlist from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.space_counts enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.votes enable row level security;
alter table public.saves enable row level security;
alter table public.reports enable row level security;
alter table public.waitlist enable row level security;

-- profiles: handles + reputation are public; nobody edits them through the API.
grant select on public.profiles to anon, authenticated;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);

-- accounts: only you; you may change locale, groups and case profiles, never admin/trial/pass.
grant select, delete on public.accounts to authenticated;
grant update (locale, spaces, case_profiles) on public.accounts to authenticated;
create policy "read own account" on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "update own account" on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own account" on public.accounts for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.space_counts to anon, authenticated;
create policy "group sizes are public" on public.space_counts for select to anon, authenticated using (true);

-- posts: live posts for everyone; held posts for their author; everything for admins.
grant select on public.posts to anon, authenticated;
grant insert (type, title, body, spaces, stage, office_id, form, filed) on public.posts to authenticated;
grant update (title, body, helpful_comment_id, status) on public.posts to authenticated;
create policy "read visible posts" on public.posts for select to anon, authenticated
  using (status = 'live' or author_id = (select auth.uid()) or (select private.is_admin()));
create policy "authors create posts" on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "authors edit, admins moderate" on public.posts for update to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()))
  with check (author_id = (select auth.uid()) or (select private.is_admin()));

grant select on public.comments to anon, authenticated;
grant insert (post_id, body) on public.comments to authenticated;
grant update (status) on public.comments to authenticated;
create policy "read visible replies" on public.comments for select to anon, authenticated
  using ((status = 'live' or author_id = (select auth.uid()) or (select private.is_admin()))
         and exists (select 1 from public.posts p where p.id = post_id));
create policy "authors create replies" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "admins moderate replies" on public.comments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- votes: your own, only on something you can see and did not write.
grant select, delete on public.votes to authenticated;
grant insert (target_kind, target_id) on public.votes to authenticated;
create policy "read own votes" on public.votes for select to authenticated using (user_id = (select auth.uid()));
create policy "vote on others' visible posts" on public.votes for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (target_kind = 'post' and exists (select 1 from public.posts p where p.id = target_id
       and p.author_id is distinct from (select auth.uid())))
    or (target_kind = 'comment' and exists (select 1 from public.comments c where c.id = target_id
       and c.status = 'live' and c.author_id is distinct from (select auth.uid())))));
create policy "remove own votes" on public.votes for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.saves to authenticated;
grant insert (post_id) on public.saves to authenticated;
create policy "read own saves" on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy "save visible posts" on public.saves for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "remove own saves" on public.saves for delete to authenticated using (user_id = (select auth.uid()));

-- reports: file one per item you can see; read your own; admins read and dismiss all.
grant select on public.reports to authenticated;
grant insert (target_kind, target_id, reason) on public.reports to authenticated;
grant update (state) on public.reports to authenticated;
create policy "read own reports, admins all" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "report visible items" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and state = 'open' and (
    (target_kind = 'post' and exists (select 1 from public.posts p where p.id = target_id))
    or (target_kind = 'comment' and exists (select 1 from public.comments c where c.id = target_id))));
create policy "admins resolve reports" on public.reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- waitlist: anyone may add an address; nobody reads it through the API.
grant insert (email, lang, source) on public.waitlist to anon, authenticated;
create policy "join the waitlist" on public.waitlist for insert to anon, authenticated
  with check (email = lower(email) and char_length(email) <= 254);
