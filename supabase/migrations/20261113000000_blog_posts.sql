-- Blog posts for the CaseCircle bilingual blog (EN/ES).
-- Each post has a language ('en' or 'es') and an optional translation_slug linking EN<->ES pairs.
-- RLS: public can read only published posts; only admins can write.

create table public.blog_posts (
  id bigint generated always as identity primary key,
  
  -- URL slug (unique per language)
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  lang text not null default 'en' check (lang in ('en', 'es')),
  translation_slug text check (translation_slug is null or translation_slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  
  -- Content
  title text not null check (char_length(title) between 5 and 200),
  meta_description text not null check (char_length(meta_description) between 10 and 320),
  body_markdown text not null check (char_length(body_markdown) between 50 and 100000),
  
  -- Sources (array of {label, url} objects)
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array' and pg_column_size(sources) <= 32768),
  
  -- Optional cover image
  cover_image_url text check (cover_image_url is null or cover_image_url ~ '^https://'),
  
  -- Status and timestamps
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  
  -- Unique constraint: one slug per language
  unique (slug, lang)
);

-- Indexes for efficient querying
create index blog_posts_published_idx on public.blog_posts (status, lang, published_at desc)
  where status = 'published';
create index blog_posts_translation_idx on public.blog_posts (translation_slug, lang)
  where translation_slug is not null;
create index blog_posts_slug_lang_idx on public.blog_posts (slug, lang);

-- Auto-update updated_at
create function private.blog_posts_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger blog_posts_updated_at before update on public.blog_posts
  for each row execute function private.blog_posts_updated_at();

revoke all on function private.blog_posts_updated_at() from public, anon, authenticated;

-- ───────────── RLS + privileges ─────────────

revoke all on public.blog_posts from anon, authenticated;

alter table public.blog_posts enable row level security;

-- Public can read only published posts
grant select on public.blog_posts to anon, authenticated;

create policy "read published blog posts" on public.blog_posts for select to anon, authenticated
  using (status = 'published');

-- Admins can read all posts (including drafts) for admin view
create policy "admins read all blog posts" on public.blog_posts for select to authenticated
  using ((select private.is_admin()));

-- Admins can insert/update/delete
grant insert, update, delete on public.blog_posts to authenticated;

create policy "admins write blog posts" on public.blog_posts for insert to authenticated
  with check ((select private.is_admin()));

create policy "admins update blog posts" on public.blog_posts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admins delete blog posts" on public.blog_posts for delete to authenticated
  using ((select private.is_admin()));
