-- Fixes for Reddit ingestion and search:
-- 1. SECURITY DEFINER upsert function that verifies a secret token hash
-- 2. Improved search with OR semantics and Spanish/simple vector support
-- 3. Private settings table for storing the ingest token hash

-- ───────────── Private settings table ─────────────
-- Stores configuration like the ingest token hash, not exposed via API

create table if not exists private.app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.app_settings is 'Private application settings. Not exposed via API.';

-- ───────────── Add simple/Spanish search vector ─────────────
-- The English tsvector misses form numbers like N-400 and Spanish words

alter table public.reddit_threads
  add column if not exists search_vector_simple tsvector
    generated always as (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(selftext, '')), 'B')
    ) stored;

create index if not exists reddit_threads_search_simple_idx
  on public.reddit_threads using gin (search_vector_simple);

-- ───────────── Upsert function with token verification ─────────────
-- Allows writes without service-role key by verifying a pre-shared token hash

create or replace function public.upsert_reddit_threads(
  payload jsonb,
  token text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  stored_hash text;
  provided_hash text;
  thread jsonb;
  upserted_count integer := 0;
  error_count integer := 0;
  errors jsonb := '[]'::jsonb;
begin
  -- Get stored token hash from private settings
  select value into stored_hash
  from private.app_settings
  where key = 'reddit_ingest_token_hash';

  if stored_hash is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ingest_not_configured',
      'message', 'No ingest token hash configured. Run the setup SQL first.'
    );
  end if;

  -- Hash the provided token and compare
  provided_hash := encode(sha256(token::bytea), 'hex');

  if provided_hash <> stored_hash then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_token',
      'message', 'Invalid ingest token'
    );
  end if;

  -- Upsert each thread
  for thread in select * from jsonb_array_elements(payload)
  loop
    begin
      insert into public.reddit_threads (
        reddit_id,
        subreddit,
        permalink,
        title,
        selftext,
        top_comments,
        score,
        num_comments,
        created_utc,
        form_tags,
        office_tags,
        step_tags
      ) values (
        thread->>'reddit_id',
        thread->>'subreddit',
        thread->>'permalink',
        thread->>'title',
        coalesce(thread->>'selftext', ''),
        coalesce(thread->'top_comments', '[]'::jsonb),
        coalesce((thread->>'score')::integer, 0),
        coalesce((thread->>'num_comments')::integer, 0),
        (thread->>'created_utc')::timestamptz,
        coalesce(
          (select array_agg(x)::text[] from jsonb_array_elements_text(thread->'form_tags') x),
          '{}'::text[]
        ),
        coalesce(
          (select array_agg(x)::text[] from jsonb_array_elements_text(thread->'office_tags') x),
          '{}'::text[]
        ),
        coalesce(
          (select array_agg(x)::text[] from jsonb_array_elements_text(thread->'step_tags') x),
          '{}'::text[]
        )
      )
      on conflict (reddit_id) do update set
        title = excluded.title,
        selftext = excluded.selftext,
        top_comments = excluded.top_comments,
        score = excluded.score,
        num_comments = excluded.num_comments,
        form_tags = excluded.form_tags,
        office_tags = excluded.office_tags,
        step_tags = excluded.step_tags,
        updated_at = now();

      upserted_count := upserted_count + 1;
    exception when others then
      error_count := error_count + 1;
      errors := errors || jsonb_build_object(
        'reddit_id', thread->>'reddit_id',
        'error', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'upserted', upserted_count,
    'errors', error_count,
    'error_details', errors
  );
end;
$$;

grant execute on function public.upsert_reddit_threads(jsonb, text) to anon, authenticated;

-- ───────────── Improved search function with OR semantics ─────────────
-- Uses simple vector for better form number matching and OR semantics for recall

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
language plpgsql stable security definer set search_path = ''
as $$
declare
  normalized_query text;
  search_tsquery tsquery;
  simple_tsquery tsquery;
  extracted_forms text[];
begin
  -- Normalize form numbers: N400 -> N-400, I485 -> I-485, etc.
  normalized_query := regexp_replace(
    upper(query),
    '\b([NI])[\-\s]?(\d{2,4}[A-Z]?)\b',
    '\1-\2',
    'gi'
  );
  
  -- Extract form numbers for tag filtering/boosting
  select array_agg(distinct upper(m[1] || '-' || m[2]))
  into extracted_forms
  from regexp_matches(normalized_query, '\b([NI])-?(\d{2,4}[A-Z]?)\b', 'gi') m;

  -- Build OR-based tsquery for better recall
  -- Convert words to OR-joined terms (not AND)
  select string_agg(lexeme, ' | ')
  into normalized_query
  from (
    select unnest(tsvector_to_array(to_tsvector('simple', normalized_query))) as lexeme
  ) t
  where lexeme !~ '^(the|a|an|is|are|was|were|be|been|being|at|in|on|to|for|of|and|or|what|how|do|does|they|ask|when|which|where|why|who|will|would|can|could|should|have|has|had|this|that|these|those|it|its|my|your|his|her|our|their)$';

  -- Handle empty query after stopword removal
  if normalized_query is null or normalized_query = '' then
    normalized_query := query;
  end if;

  -- Create tsqueries
  begin
    search_tsquery := to_tsquery('english', normalized_query);
  exception when others then
    search_tsquery := plainto_tsquery('english', query);
  end;

  begin
    simple_tsquery := to_tsquery('simple', normalized_query);
  exception when others then
    simple_tsquery := plainto_tsquery('simple', query);
  end;

  return query
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
    (
      -- Combine English and simple vector scores
      coalesce(ts_rank(t.search_vector, search_tsquery), 0) * 0.5 +
      coalesce(ts_rank(t.search_vector_simple, simple_tsquery), 0) * 0.5 +
      -- Boost for matching form tags
      case when extracted_forms is not null and t.form_tags && extracted_forms then 0.5 else 0 end +
      -- Small boost for score/activity
      least(t.score::real / 100, 0.2)
    )::real as rank
  from public.reddit_threads t
  where 
    -- Match on either vector OR on form tags
    (
      t.search_vector @@ search_tsquery
      or t.search_vector_simple @@ simple_tsquery
      or (extracted_forms is not null and t.form_tags && extracted_forms)
    )
    -- Apply optional filters
    and (form_filter is null or form_filter = any(t.form_tags))
    and (office_filter is null or office_filter = any(t.office_tags))
    and (step_filter is null or step_filter = any(t.step_tags))
  order by rank desc, t.score desc, t.created_utc desc
  limit max_results;
end;
$$;

-- ───────────── Spanish term mapping search ─────────────
-- Maps common Spanish immigration terms to English equivalents

create or replace function public.search_reddit_threads_bilingual(
  query text,
  lang text default 'en',
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
language plpgsql stable security definer set search_path = ''
as $$
declare
  translated_query text;
begin
  translated_query := query;
  
  -- Map Spanish terms to English for search (case-insensitive replacements)
  if lang = 'es' or query ~* '(entrevista|ciudadanía|residencia|permiso|trabajo|biometría|huellas|aprobación|aprobado|negado|denegado|formulario|solicitud|tarjeta|verde|pasaporte|visa|abogado|inmigración|naturalización|juramento|ceremonia)' then
    translated_query := regexp_replace(translated_query, '\bentrevista\b', 'interview', 'gi');
    translated_query := regexp_replace(translated_query, '\bciudadanía\b', 'citizenship', 'gi');
    translated_query := regexp_replace(translated_query, '\bnaturalización\b', 'naturalization', 'gi');
    translated_query := regexp_replace(translated_query, '\bresidencia\b', 'green card residence', 'gi');
    translated_query := regexp_replace(translated_query, '\bpermiso de trabajo\b', 'EAD work permit', 'gi');
    translated_query := regexp_replace(translated_query, '\bpermiso\b', 'permit', 'gi');
    translated_query := regexp_replace(translated_query, '\btrabajo\b', 'work employment', 'gi');
    translated_query := regexp_replace(translated_query, '\bbiometría\b', 'biometrics', 'gi');
    translated_query := regexp_replace(translated_query, '\bhuellas\b', 'biometrics fingerprints', 'gi');
    translated_query := regexp_replace(translated_query, '\baprobación\b', 'approval', 'gi');
    translated_query := regexp_replace(translated_query, '\baprobado\b', 'approved', 'gi');
    translated_query := regexp_replace(translated_query, '\bnegado\b', 'denied', 'gi');
    translated_query := regexp_replace(translated_query, '\bdenegado\b', 'denied', 'gi');
    translated_query := regexp_replace(translated_query, '\bformulario\b', 'form', 'gi');
    translated_query := regexp_replace(translated_query, '\bsolicitud\b', 'application', 'gi');
    translated_query := regexp_replace(translated_query, '\btarjeta verde\b', 'green card', 'gi');
    translated_query := regexp_replace(translated_query, '\bvisa\b', 'visa', 'gi');
    translated_query := regexp_replace(translated_query, '\binmigración\b', 'immigration', 'gi');
    translated_query := regexp_replace(translated_query, '\bjuramento\b', 'oath ceremony', 'gi');
    translated_query := regexp_replace(translated_query, '\bceremonia\b', 'ceremony', 'gi');
    translated_query := regexp_replace(translated_query, '\bqué preguntan\b', 'what questions ask', 'gi');
    translated_query := regexp_replace(translated_query, '\bcuánto tiempo\b', 'how long timeline', 'gi');
    translated_query := regexp_replace(translated_query, '\bcuánto tarda\b', 'how long wait time', 'gi');
  end if;

  -- Call the main search function with translated query
  return query
  select * from public.search_reddit_threads(
    translated_query,
    form_filter,
    office_filter,
    step_filter,
    max_results
  );
end;
$$;

grant execute on function public.search_reddit_threads_bilingual(text, text, text, text, text, integer) to anon, authenticated;

-- ───────────── Setup instructions ─────────────
-- To set the ingest token hash, run this SQL in Supabase SQL Editor:
--
-- insert into private.app_settings (key, value)
-- values ('reddit_ingest_token_hash', encode(sha256('YOUR_REDDIT_INGEST_SECRET_HERE'::bytea), 'hex'))
-- on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- Replace YOUR_REDDIT_INGEST_SECRET_HERE with the value of REDDIT_INGEST_SECRET on Render.
