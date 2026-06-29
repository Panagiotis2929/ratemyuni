-- ═══════════════════════════════════════════════════════════════
-- RateMyUni — Supabase Migrations
-- Run these in order in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 1. PROFILES TABLE (XP, Level, Badges)
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT        UNIQUE NOT NULL,
  uni             TEXT,
  dept            TEXT,
  xp              INTEGER     NOT NULL DEFAULT 0,
  level           INTEGER     NOT NULL DEFAULT 1,
  badges          TEXT[]      NOT NULL DEFAULT '{}',
  review_count    INTEGER     NOT NULL DEFAULT 0,
  helpful_received INTEGER    NOT NULL DEFAULT 0,
  pass_yes        INTEGER     NOT NULL DEFAULT 0,
  pass_no         INTEGER     NOT NULL DEFAULT 0,
  reputation      INTEGER     GENERATED ALWAYS AS (xp + helpful_received * 3 + review_count * 5) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_xp          ON public.profiles(xp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_reputation  ON public.profiles(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username    ON public.profiles(username);

-- ────────────────────────────────────────
-- 2. REVIEWS TABLE
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  professor_id    TEXT        NOT NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  username        TEXT,
  rating          INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  difficulty      INTEGER     CHECK (difficulty BETWEEN 1 AND 5),
  organization    INTEGER     CHECK (organization BETWEEN 1 AND 5),
  inspiration     INTEGER     CHECK (inspiration BETWEEN 1 AND 5),
  course          TEXT,
  semester        INTEGER     CHECK (semester BETWEEN 1 AND 8),
  review_text     TEXT        NOT NULL CHECK (length(review_text) >= 20),
  chips           TEXT[]      DEFAULT '{}',
  passed          BOOLEAN,
  helpful_up      INTEGER     NOT NULL DEFAULT 0,
  helpful_down    INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_professor ON public.reviews(professor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user      ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_helpful   ON public.reviews(helpful_up DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_created   ON public.reviews(created_at DESC);

-- Unique: one review per user per professor per course
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique
  ON public.reviews(user_id, professor_id, course)
  WHERE course IS NOT NULL;

-- ────────────────────────────────────────
-- 3. HELPFUL VOTES TABLE
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.helpful_votes (
  id          BIGSERIAL   PRIMARY KEY,
  review_id   TEXT        NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type   TEXT        NOT NULL CHECK (vote_type IN ('up','down')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(review_id, user_id)  -- one vote per user per review
);

CREATE INDEX IF NOT EXISTS idx_helpful_votes_review ON public.helpful_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_helpful_votes_user   ON public.helpful_votes(user_id);

-- ────────────────────────────────────────
-- 4. RLS POLICIES
-- ────────────────────────────────────────

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles visible to all"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- REVIEWS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews visible to all"
  ON public.reviews FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- HELPFUL VOTES
ALTER TABLE public.helpful_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes visible to all"
  ON public.helpful_votes FOR SELECT USING (true);

CREATE POLICY "Auth users can vote"
  ON public.helpful_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    -- Cannot vote on own review
    (SELECT user_id FROM public.reviews WHERE id = review_id) != auth.uid()
  );

-- ────────────────────────────────────────
-- 5. FUNCTIONS & TRIGGERS
-- ────────────────────────────────────────

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, uni, dept, xp, level, badges)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'uni',
    NEW.raw_user_meta_data->>'dept',
    20,   -- +20 XP for verified email on signup
    1,
    ARRAY['verified']
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Award XP after review insert
CREATE OR REPLACE FUNCTION public.award_xp_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_review_count INTEGER;
  v_xp_to_add    INTEGER := 10;
  v_new_level    INTEGER;
BEGIN
  -- Count existing reviews for this user
  SELECT review_count INTO v_review_count
  FROM public.profiles WHERE id = NEW.user_id;

  -- First review bonus
  IF v_review_count = 0 THEN
    v_xp_to_add := v_xp_to_add + 50;
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET
    xp           = xp + v_xp_to_add,
    review_count = review_count + 1,
    pass_yes     = CASE WHEN NEW.passed = TRUE  THEN pass_yes + 1 ELSE pass_yes END,
    pass_no      = CASE WHEN NEW.passed = FALSE THEN pass_no  + 1 ELSE pass_no  END,
    updated_at   = NOW()
  WHERE id = NEW.user_id;

  -- Check 10-review milestone
  IF v_review_count + 1 = 10 THEN
    UPDATE public.profiles SET xp = xp + 100 WHERE id = NEW.user_id;
    UPDATE public.profiles
    SET badges = array_append(badges, 'ten_reviews')
    WHERE id = NEW.user_id AND NOT ('ten_reviews' = ANY(badges));
  END IF;

  -- Check badge milestones
  IF v_review_count + 1 = 1 THEN
    UPDATE public.profiles
    SET badges = array_append(badges, 'first_review')
    WHERE id = NEW.user_id AND NOT ('first_review' = ANY(badges));
  END IF;
  IF v_review_count + 1 = 5 THEN
    UPDATE public.profiles
    SET badges = array_append(badges, 'five_reviews')
    WHERE id = NEW.user_id AND NOT ('five_reviews' = ANY(badges));
  END IF;
  IF v_review_count + 1 = 50 THEN
    UPDATE public.profiles
    SET badges = array_append(badges, 'fifty_reviews')
    WHERE id = NEW.user_id AND NOT ('fifty_reviews' = ANY(badges));
  END IF;

  -- Recalculate level
  SELECT CASE
    WHEN xp >= 2000 THEN 7
    WHEN xp >= 1000 THEN 6
    WHEN xp >= 600  THEN 5
    WHEN xp >= 300  THEN 4
    WHEN xp >= 150  THEN 3
    WHEN xp >= 50   THEN 2
    ELSE 1
  END INTO v_new_level
  FROM public.profiles WHERE id = NEW.user_id;

  UPDATE public.profiles SET level = v_new_level WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_review_insert ON public.reviews;
CREATE TRIGGER on_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_review();

-- Award XP on helpful vote
CREATE OR REPLACE FUNCTION public.award_xp_on_helpful_vote()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_review_author_id UUID;
  v_helpful_total    INTEGER;
BEGIN
  IF NEW.vote_type = 'up' THEN
    -- Get review author
    SELECT user_id INTO v_review_author_id
    FROM public.reviews WHERE id = NEW.review_id;

    -- Award +5 XP to review author
    IF v_review_author_id IS NOT NULL AND v_review_author_id != NEW.user_id THEN
      UPDATE public.profiles
      SET
        xp               = xp + 5,
        helpful_received = helpful_received + 1,
        updated_at       = NOW()
      WHERE id = v_review_author_id;
    END IF;

    -- Update helpful_up count on review
    UPDATE public.reviews
    SET helpful_up = helpful_up + 1
    WHERE id = NEW.review_id;

    -- Check Most Helpful badge (20+ helpful votes)
    SELECT helpful_received INTO v_helpful_total
    FROM public.profiles WHERE id = v_review_author_id;

    IF v_helpful_total >= 20 THEN
      UPDATE public.profiles
      SET badges = array_append(badges, 'most_helpful')
      WHERE id = v_review_author_id AND NOT ('most_helpful' = ANY(badges));
    END IF;

  ELSE
    -- helpful_down
    UPDATE public.reviews
    SET helpful_down = helpful_down + 1
    WHERE id = NEW.review_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_helpful_vote ON public.helpful_votes;
CREATE TRIGGER on_helpful_vote
  AFTER INSERT ON public.helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_helpful_vote();

-- Recalculate level trigger
CREATE OR REPLACE FUNCTION public.recalculate_level()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.level := CASE
    WHEN NEW.xp >= 2000 THEN 7
    WHEN NEW.xp >= 1000 THEN 6
    WHEN NEW.xp >= 600  THEN 5
    WHEN NEW.xp >= 300  THEN 4
    WHEN NEW.xp >= 150  THEN 3
    WHEN NEW.xp >= 50   THEN 2
    ELSE 1
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_profile_update ON public.profiles;
CREATE TRIGGER before_profile_update
  BEFORE UPDATE OF xp ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_level();

-- ────────────────────────────────────────
-- 6. HELPER VIEW — Professor Pass Rate
-- ────────────────────────────────────────
CREATE OR REPLACE VIEW public.professor_pass_rates AS
SELECT
  professor_id,
  COUNT(*)                                        AS total_responses,
  COUNT(*) FILTER (WHERE passed = TRUE)           AS passed_count,
  COUNT(*) FILTER (WHERE passed = FALSE)          AS failed_count,
  ROUND(
    COUNT(*) FILTER (WHERE passed = TRUE)::NUMERIC
    / NULLIF(COUNT(*), 0) * 100
  )                                               AS pass_rate_pct
FROM public.reviews
WHERE passed IS NOT NULL
GROUP BY professor_id;

-- ────────────────────────────────────────
-- 7. LEADERBOARD VIEW
-- ────────────────────────────────────────
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  username,
  level,
  xp,
  reputation,
  review_count,
  helpful_received,
  badges
FROM public.profiles
ORDER BY reputation DESC
LIMIT 100;

-- ────────────────────────────────────────
-- 8. EMAIL RESTRICTION (.edu.gr only)
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_edu_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email NOT LIKE '%.edu.gr'
     AND NEW.email NOT LIKE '%.auth.gr'
     AND NEW.email NOT LIKE '%.uoa.gr'
     AND NEW.email NOT LIKE '%.ntua.gr'
     AND NEW.email NOT LIKE '%.aueb.gr'
     AND NEW.email NOT LIKE '%.uom.edu.gr'
     AND NEW.email NOT LIKE '%.upatras.gr'
     AND NEW.email NOT LIKE '%.uoc.gr'
     AND NEW.email NOT LIKE '%.uoi.gr'
     AND NEW.email NOT LIKE '%.duth.gr'
     AND NEW.email NOT LIKE '%.panteion.gr'
     AND NEW.email NOT LIKE '%.unipi.gr'
     AND NEW.email NOT LIKE '%.aegean.gr'
     AND NEW.email NOT LIKE '%.ionio.gr'
     AND NEW.email NOT LIKE '%.uth.gr'
     AND NEW.email NOT LIKE '%.hua.gr'
     AND NEW.email NOT LIKE '%.aua.gr'
  THEN
    RAISE EXCEPTION 'Απαιτείται πανεπιστημιακό email (.edu.gr)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_edu_email ON auth.users;
CREATE TRIGGER enforce_edu_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_edu_email();

-- ════════════════════════════════════════
-- DONE — All migrations applied!
-- ════════════════════════════════════════
