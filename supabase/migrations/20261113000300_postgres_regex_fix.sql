-- Fix Postgres regex: use \y (word boundary) instead of \b (backspace in Postgres)
-- Also handle accents: match both ciudadanía and ciudadania

-- ───────────── Fixed bilingual search with correct Postgres regex ─────────────

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
  normalized_for_match text;
begin
  translated_query := query;
  implied_forms := '{}'::text[];
  
  -- Normalize query for matching: lowercase and remove accents for comparison
  -- This allows matching both "ciudadanía" and "ciudadania"
  normalized_for_match := lower(translate(query,
    'áéíóúüñÁÉÍÓÚÜÑ',
    'aeiouunAEIOUUN'
  ));
  
  -- Detect Spanish query (using normalized text for reliable matching)
  is_spanish := lang = 'es' or normalized_for_match ~* '(entrevista|ciudadania|ciudadano|residencia|permiso|trabajo|biometria|huellas|aprobacion|aprobado|negado|denegado|formulario|solicitud|tarjeta|verde|pasaporte|visa|abogado|inmigracion|naturalizacion|juramento|ceremonia|civica|examen|peticion|familiar)';
  
  if is_spanish then
    -- ═══════════════════════════════════════════════════════════════════
    -- FORM NUMBER EXTRACTION FROM SPANISH TERMS (strong boost)
    -- Using \y for word boundary and accent-normalized matching
    -- ═══════════════════════════════════════════════════════════════════
    
    -- N-400 (Citizenship/Naturalization)
    -- Match: ciudadanía/ciudadania, naturalización/naturalizacion, juramento, examen de cívica/civica
    if normalized_for_match ~* '\y(ciudadania|ciudadano|naturalizacion|juramento)\y'
       or normalized_for_match ~* 'examen\s*(de\s*)?civica'
       or normalized_for_match ~* 'ceremonia\s*(de\s*)?juramento' then
      implied_forms := array_append(implied_forms, 'N-400');
    end if;
    
    -- I-485 (Green Card / Adjustment of Status)
    if normalized_for_match ~* '\y(residencia)\y'
       or normalized_for_match ~* 'tarjeta\s*verde'
       or normalized_for_match ~* 'ajuste\s*(de\s*)?estatus'
       or normalized_for_match ~* 'green\s*card' then
      implied_forms := array_append(implied_forms, 'I-485');
    end if;
    
    -- I-765 (Work Permit / EAD)
    if normalized_for_match ~* 'permiso\s*(de\s*)?trabajo'
       or normalized_for_match ~* '\yead\y'
       or normalized_for_match ~* 'autorizacion\s*(de\s*)?empleo' then
      implied_forms := array_append(implied_forms, 'I-765');
    end if;
    
    -- I-130 (Family Petition)
    if normalized_for_match ~* 'peticion\s*familiar'
       or normalized_for_match ~* 'peticion\s*(de\s*)?familia'
       or normalized_for_match ~* 'patrocinio\s*familiar' then
      implied_forms := array_append(implied_forms, 'I-130');
    end if;
    
    -- I-751 (Remove Conditions on Green Card)
    if normalized_for_match ~* 'remover\s*condiciones'
       or normalized_for_match ~* 'quitar\s*condiciones'
       or normalized_for_match ~* 'residencia\s*condicional'
       or normalized_for_match ~* '\yi-?751\y' then
      implied_forms := array_append(implied_forms, 'I-751');
    end if;
    
    -- I-131 (Advance Parole / Travel Document)
    if normalized_for_match ~* 'permiso\s*(de\s*)?viaje'
       or normalized_for_match ~* 'advance\s*parole'
       or normalized_for_match ~* 'documento\s*(de\s*)?viaje' then
      implied_forms := array_append(implied_forms, 'I-131');
    end if;
    
    -- ═══════════════════════════════════════════════════════════════════
    -- TERM TRANSLATION (for text matching)
    -- Using \y for word boundaries in Postgres regex
    -- ═══════════════════════════════════════════════════════════════════
    
    -- Citizenship terms → naturalization citizenship N-400
    -- Match with and without accents
    translated_query := regexp_replace(translated_query, '\y(ciudadanía|ciudadania)\y', 'citizenship naturalization N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\yciudadano\y', 'citizen citizenship N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\y(naturalización|naturalizacion)\y', 'naturalization citizenship N-400', 'gi');
    translated_query := regexp_replace(translated_query, '\yjuramento\y', 'oath ceremony naturalization N-400', 'gi');
    translated_query := regexp_replace(translated_query, 'examen\s*(de\s*)?(cívica|civica)', 'civics test N-400 naturalization', 'gi');
    translated_query := regexp_replace(translated_query, 'ceremonia\s*(de\s*)?juramento', 'oath ceremony naturalization', 'gi');
    
    -- Green card terms → I-485 green card
    translated_query := regexp_replace(translated_query, '\yresidencia\y', 'green card I-485 residence adjustment', 'gi');
    translated_query := regexp_replace(translated_query, 'tarjeta\s*verde', 'green card I-485', 'gi');
    translated_query := regexp_replace(translated_query, 'ajuste\s*(de\s*)?estatus', 'adjustment of status I-485', 'gi');
    
    -- Work permit terms → I-765 EAD
    translated_query := regexp_replace(translated_query, 'permiso\s*(de\s*)?trabajo', 'EAD work permit I-765', 'gi');
    translated_query := regexp_replace(translated_query, '(autorización|autorizacion)\s*(de\s*)?empleo', 'EAD employment authorization I-765', 'gi');
    
    -- Family petition terms → I-130
    translated_query := regexp_replace(translated_query, '(petición|peticion)\s*familiar', 'family petition I-130', 'gi');
    translated_query := regexp_replace(translated_query, 'patrocinio\s*familiar', 'family sponsorship I-130', 'gi');
    
    -- General terms (with accent variants)
    translated_query := regexp_replace(translated_query, '\yentrevista\y', 'interview', 'gi');
    translated_query := regexp_replace(translated_query, '\y(biometría|biometria)\y', 'biometrics', 'gi');
    translated_query := regexp_replace(translated_query, '\yhuellas\y', 'biometrics fingerprints', 'gi');
    translated_query := regexp_replace(translated_query, '\y(aprobación|aprobacion)\y', 'approval approved', 'gi');
    translated_query := regexp_replace(translated_query, '\yaprobado\y', 'approved approval', 'gi');
    translated_query := regexp_replace(translated_query, '\ynegado\y', 'denied denial', 'gi');
    translated_query := regexp_replace(translated_query, '\ydenegado\y', 'denied denial', 'gi');
    translated_query := regexp_replace(translated_query, '\yformulario\y', 'form', 'gi');
    translated_query := regexp_replace(translated_query, '\ysolicitud\y', 'application', 'gi');
    translated_query := regexp_replace(translated_query, '\yvisa\y', 'visa', 'gi');
    translated_query := regexp_replace(translated_query, '\y(inmigración|inmigracion)\y', 'immigration', 'gi');
    translated_query := regexp_replace(translated_query, '\yceremonia\y', 'ceremony', 'gi');
    translated_query := regexp_replace(translated_query, '(qué|que)\s*preguntan', 'what questions ask', 'gi');
    translated_query := regexp_replace(translated_query, '(cuánto|cuanto)\s*tiempo', 'how long timeline', 'gi');
    translated_query := regexp_replace(translated_query, '(cuánto|cuanto)\s*tarda', 'how long wait time timeline', 'gi');
    translated_query := regexp_replace(translated_query, '\ypermiso\y', 'permit', 'gi');
    translated_query := regexp_replace(translated_query, '\ytrabajo\y', 'work employment', 'gi');
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

-- ───────────── Fixed search function with correct Postgres regex ─────────────

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
  -- Using \y for word boundary in Postgres (not \b which is backspace)
  normalized_query := regexp_replace(
    upper(query),
    '\y([NI])[\-\s]?(\d{2,4}[A-Z]?)\y',
    '\1-\2',
    'gi'
  );
  
  -- Extract form numbers from query text using Postgres regex
  select array_agg(distinct upper(m[1] || '-' || m[2]))
  into extracted_forms
  from regexp_matches(normalized_query, '\y([NI])-?(\d{2,4}[A-Z]?)\y', 'gi') m;

  -- Combine extracted forms with explicit boost forms (remove duplicates)
  all_boost_forms := coalesce(extracted_forms, '{}'::text[]) || coalesce(boost_forms, '{}'::text[]);
  select array_agg(distinct f) into all_boost_forms from unnest(all_boost_forms) f;

  -- Build OR-based tsquery for better recall
  select string_agg(lexeme, ' | ')
  into normalized_query
  from (
    select unnest(tsvector_to_array(to_tsvector('simple', normalized_query))) as lexeme
  ) t
  where lexeme !~ '^\y(the|a|an|is|are|was|were|be|been|being|at|in|on|to|for|of|and|or|what|how|do|does|they|ask|when|which|where|why|who|will|would|can|could|should|have|has|had|this|that|these|those|it|its|my|your|his|her|our|their|cuanto|que|tarda|la|el|de|en|del)\y$';

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

-- ───────────── Update search_reddit_threads to use fixed version ─────────────

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
  -- Delegate to the boost function with no explicit boost forms
  return query
  select * from public.search_reddit_threads_with_form_boost(
    query,
    '{}'::text[],
    form_filter,
    office_filter,
    step_filter,
    max_results
  );
end;
$$;
