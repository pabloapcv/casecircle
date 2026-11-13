-- Migration: insights_aggregates_security
-- Timestamp: 20261113160500
-- Purpose: Security hardening and idempotent CREATE statements for insights aggregate tables
-- NOTE: Do NOT apply this migration without owner approval. The insights_aggregates objects
-- were already applied to prod at 16:05 UTC; this migration documents the schema and fixes security.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Idempotent table creation (IF NOT EXISTS)
-- These match the prod schema exactly (from information_schema).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.insights_form_counts (
  form text PRIMARY KEY,
  post_count bigint NOT NULL,
  question_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_step_counts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  step text NOT NULL,
  post_count bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_year_trends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  year int NOT NULL,
  post_count bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_subreddit_counts (
  subreddit text PRIMARY KEY,
  post_count bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_rfe_topics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  post_count bigint NOT NULL,
  example_reddit_id text,
  example_title text,
  example_permalink text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_example_posts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text,
  step text,
  reddit_id text NOT NULL,
  subreddit text NOT NULL,
  title text NOT NULL,
  permalink text NOT NULL,
  score int NOT NULL,
  num_comments int NOT NULL,
  created_utc timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights_meta (
  key text PRIMARY KEY,
  value_text text,
  value_int bigint,
  value_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: Enable RLS on all tables
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.insights_form_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_step_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_year_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_subreddit_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_rfe_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_example_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_meta ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: Drop existing policies (using live policy names) and create strict SELECT-only policies for anon
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "anon can read insights_form_counts" ON public.insights_form_counts;
DROP POLICY IF EXISTS "anon can read insights_step_counts" ON public.insights_step_counts;
DROP POLICY IF EXISTS "anon can read insights_year_trends" ON public.insights_year_trends;
DROP POLICY IF EXISTS "anon can read insights_subreddit_counts" ON public.insights_subreddit_counts;
DROP POLICY IF EXISTS "anon can read insights_rfe_topics" ON public.insights_rfe_topics;
DROP POLICY IF EXISTS "anon can read insights_example_posts" ON public.insights_example_posts;
DROP POLICY IF EXISTS "anon can read insights_meta" ON public.insights_meta;

CREATE POLICY "anon can read insights_form_counts" ON public.insights_form_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_step_counts" ON public.insights_step_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_year_trends" ON public.insights_year_trends FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_subreddit_counts" ON public.insights_subreddit_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_rfe_topics" ON public.insights_rfe_topics FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_example_posts" ON public.insights_example_posts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read insights_meta" ON public.insights_meta FOR SELECT TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: Revoke all privileges from anon/authenticated, grant SELECT only
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.insights_form_counts FROM anon, authenticated;
REVOKE ALL ON public.insights_step_counts FROM anon, authenticated;
REVOKE ALL ON public.insights_year_trends FROM anon, authenticated;
REVOKE ALL ON public.insights_subreddit_counts FROM anon, authenticated;
REVOKE ALL ON public.insights_rfe_topics FROM anon, authenticated;
REVOKE ALL ON public.insights_example_posts FROM anon, authenticated;
REVOKE ALL ON public.insights_meta FROM anon, authenticated;

GRANT SELECT ON public.insights_form_counts TO anon;
GRANT SELECT ON public.insights_step_counts TO anon;
GRANT SELECT ON public.insights_year_trends TO anon;
GRANT SELECT ON public.insights_subreddit_counts TO anon;
GRANT SELECT ON public.insights_rfe_topics TO anon;
GRANT SELECT ON public.insights_example_posts TO anon;
GRANT SELECT ON public.insights_meta TO anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: Refresh function matching the live prod function exactly,
-- with ONE FIX: question_count uses position('?' in title) > 0 instead of regex
-- Uses unnest(form_tags) and unnest(step_tags) since reddit_threads has no `form` column.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_insights_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_min_date timestamptz;
  v_max_date timestamptz;
  v_total bigint;
  v_year_counts jsonb;
BEGIN
  -- Get date range and totals
  SELECT MIN(created_utc), MAX(created_utc), COUNT(*)
  INTO v_min_date, v_max_date, v_total
  FROM reddit_threads;

  -- Year counts for coverage notes
  SELECT jsonb_object_agg(year, cnt)
  INTO v_year_counts
  FROM (
    SELECT EXTRACT(YEAR FROM created_utc)::int as year, COUNT(*) as cnt
    FROM reddit_threads
    GROUP BY 1
  ) sub;

  -- Clear and refresh form counts
  -- FIX: Use position('?' in title) > 0 for literal question mark, not regex
  TRUNCATE insights_form_counts;
  INSERT INTO insights_form_counts (form, post_count, question_count)
  SELECT 
    f.form,
    COUNT(*) as post_count,
    COUNT(*) FILTER (WHERE position('?' in t.title) > 0) as question_count
  FROM reddit_threads t, unnest(t.form_tags) f(form)
  GROUP BY f.form;

  -- Clear and refresh step counts
  TRUNCATE insights_step_counts;
  INSERT INTO insights_step_counts (form, step, post_count)
  SELECT f.form, s.step, COUNT(*)
  FROM reddit_threads t, unnest(t.form_tags) f(form), unnest(t.step_tags) s(step)
  WHERE f.form IN ('I-485','I-130','I-765','N-400','I-751','I-129F','I-140','I-131','I-90','I-589')
  GROUP BY f.form, s.step
  HAVING COUNT(*) >= 5;

  -- Clear and refresh year trends
  TRUNCATE insights_year_trends;
  INSERT INTO insights_year_trends (form, year, post_count)
  SELECT f.form, EXTRACT(YEAR FROM t.created_utc)::int, COUNT(*)
  FROM reddit_threads t, unnest(t.form_tags) f(form)
  WHERE f.form IN ('I-485','I-130','I-765','N-400','I-751','I-129F','I-140','I-131','I-90')
  GROUP BY f.form, EXTRACT(YEAR FROM t.created_utc)::int;

  -- Clear and refresh subreddit counts
  TRUNCATE insights_subreddit_counts;
  INSERT INTO insights_subreddit_counts (subreddit, post_count)
  SELECT subreddit, COUNT(*) FROM reddit_threads GROUP BY subreddit;

  -- Clear and refresh RFE topics
  TRUNCATE insights_rfe_topics;
  INSERT INTO insights_rfe_topics (form, post_count, example_reddit_id, example_title, example_permalink)
  SELECT DISTINCT ON (f.form)
    f.form,
    COUNT(*) OVER (PARTITION BY f.form) as post_count,
    t.reddit_id,
    t.title,
    t.permalink
  FROM reddit_threads t, unnest(t.form_tags) f(form)
  WHERE 'rfe' = ANY(t.step_tags)
  ORDER BY f.form, t.score DESC;

  -- Clear and refresh example posts (top 5 per form by score)
  TRUNCATE insights_example_posts;
  INSERT INTO insights_example_posts (form, step, reddit_id, subreddit, title, permalink, score, num_comments, created_utc)
  SELECT form, step, reddit_id, subreddit, title, permalink, score, num_comments, created_utc
  FROM (
    SELECT 
      f.form,
      COALESCE((SELECT unnest FROM unnest(t.step_tags) LIMIT 1), '') as step,
      t.reddit_id, t.subreddit, t.title, t.permalink, t.score, t.num_comments, t.created_utc,
      ROW_NUMBER() OVER (PARTITION BY f.form ORDER BY t.score DESC) as rn
    FROM reddit_threads t, unnest(t.form_tags) f(form)
    WHERE t.score > 5
      AND f.form IN ('I-485','I-130','I-765','N-400','I-751','I-129F','I-140','I-131','I-90')
  ) sub
  WHERE rn <= 5;

  -- Also add top overall posts (no form filter)
  INSERT INTO insights_example_posts (form, step, reddit_id, subreddit, title, permalink, score, num_comments, created_utc)
  SELECT NULL, '', reddit_id, subreddit, title, permalink, score, num_comments, created_utc
  FROM (
    SELECT reddit_id, subreddit, title, permalink, score, num_comments, created_utc,
           ROW_NUMBER() OVER (ORDER BY score DESC) as rn
    FROM reddit_threads
    WHERE score > 20
  ) sub
  WHERE rn <= 10;

  -- Update metadata
  -- FIX: Coverage note corrected to match actual data range (June 2023, not Nov 2023)
  DELETE FROM insights_meta;
  INSERT INTO insights_meta (key, value_text) VALUES ('min_date', v_min_date::text);
  INSERT INTO insights_meta (key, value_text) VALUES ('max_date', v_max_date::text);
  INSERT INTO insights_meta (key, value_int) VALUES ('total_posts', v_total);
  INSERT INTO insights_meta (key, value_json) VALUES ('year_counts', v_year_counts);
  INSERT INTO insights_meta (key, value_text) VALUES ('refreshed_at', now()::text);
  INSERT INTO insights_meta (key, value_text) VALUES ('coverage_note', 
    'Data is sampled: 2024 is most complete; 2023 starts June 14; 2025 and 2026 are sampled, not complete.');
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 6: Revoke EXECUTE on function from PUBLIC/anon/authenticated, 
--         grant EXECUTE only to service_role
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.refresh_insights_aggregates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_insights_aggregates() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_insights_aggregates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_insights_aggregates() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 7: Grant full table access to service_role for refresh operations
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT ALL ON public.insights_form_counts TO service_role;
GRANT ALL ON public.insights_step_counts TO service_role;
GRANT ALL ON public.insights_year_trends TO service_role;
GRANT ALL ON public.insights_subreddit_counts TO service_role;
GRANT ALL ON public.insights_rfe_topics TO service_role;
GRANT ALL ON public.insights_example_posts TO service_role;
GRANT ALL ON public.insights_meta TO service_role;
