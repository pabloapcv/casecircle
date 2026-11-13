-- Migration: insights_aggregates_security
-- Timestamp: 20261113160500
-- Purpose: Security hardening and idempotent CREATE statements for insights aggregate tables
-- NOTE: Do NOT apply this migration without owner approval. The insights_aggregates objects
-- were already applied to prod at 16:05 UTC; this migration documents the schema and fixes security.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Idempotent table creation (IF NOT EXISTS)
-- These match what was applied to prod, for repo documentation purposes.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.insights_form_counts (
  form text PRIMARY KEY,
  post_count int NOT NULL DEFAULT 0,
  question_count int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.insights_step_counts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  step text NOT NULL,
  post_count int NOT NULL DEFAULT 0,
  UNIQUE(form, step)
);

CREATE TABLE IF NOT EXISTS public.insights_year_trends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  year int NOT NULL,
  post_count int NOT NULL DEFAULT 0,
  UNIQUE(form, year)
);

CREATE TABLE IF NOT EXISTS public.insights_subreddit_counts (
  subreddit text PRIMARY KEY,
  post_count int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.insights_rfe_topics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text NOT NULL,
  post_count int NOT NULL DEFAULT 0,
  example_permalink text
);

CREATE TABLE IF NOT EXISTS public.insights_example_posts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form text,
  subreddit text NOT NULL,
  title text NOT NULL,
  permalink text NOT NULL,
  score int NOT NULL DEFAULT 0,
  num_comments int NOT NULL DEFAULT 0,
  created_utc timestamptz
);

CREATE TABLE IF NOT EXISTS public.insights_meta (
  key text PRIMARY KEY,
  value_text text,
  value_int bigint,
  value_json jsonb
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
-- PART 3: Drop existing policies and create strict SELECT-only policies for anon
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "anon can read form counts" ON public.insights_form_counts;
DROP POLICY IF EXISTS "anon can read step counts" ON public.insights_step_counts;
DROP POLICY IF EXISTS "anon can read year trends" ON public.insights_year_trends;
DROP POLICY IF EXISTS "anon can read subreddit counts" ON public.insights_subreddit_counts;
DROP POLICY IF EXISTS "anon can read rfe topics" ON public.insights_rfe_topics;
DROP POLICY IF EXISTS "anon can read example posts" ON public.insights_example_posts;
DROP POLICY IF EXISTS "anon can read meta" ON public.insights_meta;

CREATE POLICY "anon can read form counts" ON public.insights_form_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read step counts" ON public.insights_step_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read year trends" ON public.insights_year_trends FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read subreddit counts" ON public.insights_subreddit_counts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read rfe topics" ON public.insights_rfe_topics FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read example posts" ON public.insights_example_posts FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read meta" ON public.insights_meta FOR SELECT TO anon USING (true);

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
-- PART 5: Refresh function with FIXED question_count filter
-- Uses position('?' in title) > 0 instead of regex which matches everything
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_insights_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_date date;
  v_max_date date;
  v_total int;
BEGIN
  -- Get date range
  SELECT MIN(created_utc::date), MAX(created_utc::date), COUNT(*)
  INTO v_min_date, v_max_date, v_total
  FROM reddit_threads;

  -- Clear existing aggregates
  TRUNCATE insights_form_counts, insights_step_counts, insights_year_trends,
           insights_subreddit_counts, insights_rfe_topics, insights_example_posts, insights_meta;

  -- Form counts with FIXED question detection using position() for literal '?'
  INSERT INTO insights_form_counts (form, post_count, question_count)
  SELECT 
    form,
    COUNT(*) as post_count,
    COUNT(*) FILTER (WHERE position('?' in title) > 0) as question_count
  FROM reddit_threads
  WHERE form IS NOT NULL
  GROUP BY form
  ORDER BY post_count DESC;

  -- Step counts (milestone mentions)
  INSERT INTO insights_step_counts (form, step, post_count)
  SELECT form, step, COUNT(*) as post_count
  FROM (
    SELECT form,
      CASE
        WHEN lower(title) ~ '\y(approv|green.?card.?received|card.?produc)\y' THEN 'approval'
        WHEN lower(title) ~ '\y(interview|oath|ceremon)\y' THEN 'interview'
        WHEN lower(title) ~ '\y(biometric|fingerprint)\y' THEN 'biometrics'
        WHEN lower(title) ~ '\y(rfe|request.for.evidence|noid)\y' THEN 'rfe'
        WHEN lower(title) ~ '\y(receiv|receipt|i-797)\y' THEN 'received'
        WHEN lower(title) ~ '\y(schedul|notice)\y' THEN 'scheduled'
        WHEN lower(title) ~ '\y(deni|reject)\y' THEN 'denial'
        WHEN lower(title) ~ '\y(expedite)\y' THEN 'expedite'
        ELSE NULL
      END as step
    FROM reddit_threads
    WHERE form IS NOT NULL
  ) sub
  WHERE step IS NOT NULL
  GROUP BY form, step
  ORDER BY form, post_count DESC;

  -- Year trends
  INSERT INTO insights_year_trends (form, year, post_count)
  SELECT form, EXTRACT(YEAR FROM created_utc)::int as year, COUNT(*) as post_count
  FROM reddit_threads
  WHERE form IS NOT NULL AND created_utc IS NOT NULL
  GROUP BY form, year
  ORDER BY form, year;

  -- Subreddit counts
  INSERT INTO insights_subreddit_counts (subreddit, post_count)
  SELECT subreddit, COUNT(*) as post_count
  FROM reddit_threads
  GROUP BY subreddit
  ORDER BY post_count DESC;

  -- RFE topics by form
  INSERT INTO insights_rfe_topics (form, post_count, example_permalink)
  SELECT 
    form,
    COUNT(*) as post_count,
    (SELECT permalink FROM reddit_threads r2 
     WHERE r2.form = r1.form 
       AND lower(r2.title) ~ '\y(rfe|request.for.evidence)\y'
     ORDER BY score DESC NULLS LAST LIMIT 1) as example_permalink
  FROM reddit_threads r1
  WHERE form IS NOT NULL
    AND lower(title) ~ '\y(rfe|request.for.evidence)\y'
  GROUP BY form
  ORDER BY post_count DESC;

  -- Example posts (high engagement)
  INSERT INTO insights_example_posts (form, subreddit, title, permalink, score, num_comments, created_utc)
  SELECT form, subreddit, title, permalink, COALESCE(score, 0), COALESCE(num_comments, 0), created_utc
  FROM reddit_threads
  WHERE score >= 10 OR num_comments >= 10
  ORDER BY COALESCE(score, 0) + COALESCE(num_comments, 0) DESC
  LIMIT 100;

  -- Meta information
  INSERT INTO insights_meta (key, value_text, value_int, value_json)
  VALUES 
    ('min_date', v_min_date::text, NULL, NULL),
    ('max_date', v_max_date::text, NULL, NULL),
    ('total_posts', NULL, v_total, NULL),
    ('coverage_note', '2024 is most complete. 2023 has Nov-Dec only. 2025 and 2026 are sampled.', NULL, NULL),
    ('refreshed_at', NOW()::text, NULL, NULL);
END;
$$;

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
