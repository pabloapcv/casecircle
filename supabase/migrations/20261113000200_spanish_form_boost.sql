-- Fix Spanish search ranking: map Spanish terms to form numbers with strong boost
-- "¿Cuánto tarda la entrevista de ciudadanía?" should return mostly N-400 threads

-- ───────────── Updated bilingual search with form number extraction ─────────────

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
  implied_forms text[];
  is_spanish boolean;
begin
  translated_query := query;
  implied_forms := '{}'::text[];
  
  -- Detect Spanish query
  is_spanish := lang = 'es' or query ~* '(entrevista|ciudadanía|ciudadano|residencia|permiso|trabajo|biometría|huellas|aprobación|aprobado|negado|denegado|formulario|solicitud|tarjeta|verde|pasaporte|visa|abogado|inmigración|naturalización|juramento|ceremonia|cívica|civica|examen|petición|familiar)';
  
  if is_spanish then
    -- ═══════════════════════════════════════════════════════════════════
    -- FORM NUMBER EXTRACTION FROM SPANISH TERMS (strong boost)
    -- ═══════════════════════════════════════════════════════════════════
    
    -- N-400 (Citizenship/Naturalization)
    if query ~* '\b(ciudadanía|ciudadano|naturalización|naturalizacion|juramento|examen\s*(de\s*)?(cívica|civica)|ceremonia\s*(de\s*)?juramento)\b' then
      implied_forms := array_append(implied_forms, 'N-400');
    end if;
    
    -- I-485 (Green Card / Adjustment of Status)
    if query ~* '\b(residencia|tarjeta\s*verde|ajuste\s*(de\s*)?estatus|green\s*card)\b' then
      implied_forms := array_append(implied_forms, 'I-485');
    end if;
    
    -- I-765 (Work Permit / EAD)
    if query ~* '\b(permiso\s*(de\s*)?trabajo|ead|autorización\s*(de\s*)?empleo)\b' then
      implied_forms := array_append(implied_forms, 'I-765');
    end if;
    
    -- I-130 (Family Petition)
    if query ~* '\b(petición\s*familiar|peticion\s*familiar|petición\s*(de\s*)?familia|patrocinio\s*familiar)\b' then
      implied_forms := array_append(implied_forms, 'I-130');
    end if;
    
    -- I-751 (Remove Conditions on Green Card)
    if query ~* '\b(remover\s*condiciones|quitar\s*condiciones|residencia\s*condicional|i-?751)\b' then
      implied_forms := array_append(implied_forms, 'I-751');
    end if;
    
    -- I-131 (Advance Parole / Travel Document)
    if query ~* '\b(permiso\s*(de\s*)?viaje|advance\s*parole|documento\s*(de\s*)?viaje)\b' then
      implied_forms := array_append(implied_forms, 'I-131');
    end if;
    
    -- ═══════════════════════════════════════════════════════════════════
    -- TERM TRANSLATION (for text matching)
    -- ═══════════════════════════════════════════════════════════════════
    
    -- Citizenship terms → naturalization citizenship N-400
    translated_query := regexp_replace(translated_query, '\bciudadanía\b', 'citizenship naturalization N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\bciudadano\b', 'citizen citizenship N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\bnaturalización\b', 'naturalization citizenship N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\bjuramento\b', 'oath ceremony naturalization N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\bexamen\s*(de\s*)?(cívica|civica)\b', 'civics test N-400 naturalization', 'gi');
    translated_query := regexp_replace(translated_query, '\bceremonia\s*(de\s*)?juramento\b', 'oath ceremony naturalization', 'gi');
    
    -- Green card terms → I-485 green card
    translated_query := regexp_replace(translated_query, '\bresidencia\b', 'green card I-485 residence adjustment', 'gi');
    translated_query := regexp_replace(translated_query, '\btarjeta\s*verde\b', 'green card I-485', 'gi');
    translated_query := regexp_replace(translated_query, '\bajuste\s*(de\s*)?estatus\b', 'adjustment of status I-485', 'gi');
    
    -- Work permit terms → I-765 EAD
    translated_query := regexp_replace(translated_query, '\bpermiso\s*(de\s*)?trabajo\b', 'EAD work permit I-765', 'gi');
    translated_query := regexp_replace(translated_query, '\bautorización\s*(de\s*)?empleo\b', 'EAD employment authorization I-765', 'gi');
    
    -- Family petition terms → I-130
    translated_query := regexp_replace(translated_query, '\bpetición\s*familiar\b', 'family petition I-130', 'gi');
    translated_query := regexp_replace(translated_query, '\bpeticion\s*familiar\b', 'family petition I-130', 'gi');
    translated_query := regexp_replace(translated_query, '\bpatrocinio\s*familiar\b', 'family sponsorship I-130', 'gi');
    
    -- General terms
    translated_query := regexp_replace(translated_query, '\bentrevista\b', 'interview', 'gi');
    translated_query := regexp_replace(translated_query, '\bbiometría\b', 'biometrics', 'gi');
    translated_query := regexp_replace(translated_query, '\bhuellas\b', 'biometrics fingerprints', 'gi');
    translated_query := regexp_replace(translated_query, '\baprobación\b', 'approval approved', 'gi');
    translated_query := regexp_replace(translated_query, '\baprobado\b', 'approved approval', 'gi');
    translated_query := regexp_replace(translated_query, '\bnegado\b', 'denied denial', 'gi');
    translated_query := regexp_replace(translated_query, '\bdenegado\b', 'denied denial', 'gi');
    translated_query := regexp_replace(translated_query, '\bformulario\b', 'form', 'gi');
    translated_query := regexp_replace(translated_query, '\bsolicitud\b', 'application', 'gi');
    translated_query := regexp_replace(translated_query, '\bvisa\b', 'visa', 'gi');
    translated_query := regexp_replace(translated_query, '\binmigración\b', 'immigration', 'gi');
    translated_query := regexp_replace(translated_query, '\bceremonia\b', 'ceremony', 'gi');
    translated_query := regexp_replace(translated_query, '\bqué preguntan\b', 'what questions ask', 'gi');
    translated_query := regexp_replace(translated_query, '\bcuánto tiempo\b', 'how long timeline', 'gi');
    translated_query := regexp_replace(translated_query, '\bcuánto tarda\b', 'how long wait time timeline', 'gi');
    translated_query := regexp_replace(translated_query, '\bpermiso\b', 'permit', 'gi');
    translated_query := regexp_replace(translated_query, '\btrabajo\b', 'work employment', 'gi');
  end if;

  -- Call the main search function with translated query and implied forms
  return query
  select * from public.search_reddit_threads_with_form_boost(
    translated_query,
    implied_forms,
    form_filter,
    office_filter,
    step_filter,
    max_results
  );
end;
$$;

-- ───────────── New search function with explicit form boost parameter ─────────────

create or replace function public.search_reddit_threads_with_form_boost(
  query text,
  boost_forms text[] default '{}'::text[],
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
  all_boost_forms text[];
begin
  -- Normalize form numbers: N400 -> N-400, I485 -> I-485, etc.
  normalized_query := regexp_replace(
    upper(query),
    '\b([NI])[\-\s]?(\d{2,4}[A-Z]?)\b',
    '\1-\2',
    'gi'
  );
  
  -- Extract form numbers from query text
  select array_agg(distinct upper(m[1] || '-' || m[2]))
  into extracted_forms
  from regexp_matches(normalized_query, '\b([NI])-?(\d{2,4}[A-Z]?)\b', 'gi') m;

  -- Combine extracted forms with explicit boost forms (remove duplicates)
  all_boost_forms := coalesce(extracted_forms, '{}'::text[]) || coalesce(boost_forms, '{}'::text[]);
  select array_agg(distinct f) into all_boost_forms from unnest(all_boost_forms) f;

  -- Build OR-based tsquery for better recall
  select string_agg(lexeme, ' | ')
  into normalized_query
  from (
    select unnest(tsvector_to_array(to_tsvector('simple', normalized_query))) as lexeme
  ) t
  where lexeme !~ '^(the|a|an|is|are|was|were|be|been|being|at|in|on|to|for|of|and|or|what|how|do|does|they|ask|when|which|where|why|who|will|would|can|could|should|have|has|had|this|that|these|those|it|its|my|your|his|her|our|their|cuánto|cuanto|qué|que|tarda|la|el|de|en|del)$';

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
      coalesce(ts_rank(t.search_vector, search_tsquery), 0) * 0.3 +
      coalesce(ts_rank(t.search_vector_simple, simple_tsquery), 0) * 0.3 +
      -- STRONG boost for matching form tags from Spanish term extraction
      case when all_boost_forms is not null and array_length(all_boost_forms, 1) > 0 and t.form_tags && all_boost_forms then 1.0 else 0 end +
      -- Small boost for score/activity
      least(t.score::real / 100, 0.1)
    )::real as rank
  from public.reddit_threads t
  where 
    -- Match on either vector OR on form tags
    (
      t.search_vector @@ search_tsquery
      or t.search_vector_simple @@ simple_tsquery
      or (all_boost_forms is not null and array_length(all_boost_forms, 1) > 0 and t.form_tags && all_boost_forms)
    )
    -- Apply optional filters
    and (form_filter is null or form_filter = any(t.form_tags))
    and (office_filter is null or office_filter = any(t.office_tags))
    and (step_filter is null or step_filter = any(t.step_tags))
  order by rank desc, t.score desc, t.created_utc desc
  limit max_results;
end;
$$;

grant execute on function public.search_reddit_threads_with_form_boost(text, text[], text, text, text, integer) to anon, authenticated;

-- ───────────── Update the original search function to use the new one ─────────────

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
begin
  -- Delegate to the new function with no explicit boost forms
  return query
  select * from public.search_reddit_threads_with_form_boost(
    query,
    '{}'::text[],  -- No explicit boost forms
    form_filter,
    office_filter,
    step_filter,
    max_results
  );
end;
$$;
