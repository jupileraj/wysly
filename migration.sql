-- ============================================================
-- Wysly Weekplanner — Supabase SQL Migration
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- Profiles (uitbreiding op auth.users)
CREATE TABLE profiles (
  id             UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name           TEXT        NOT NULL,
  contract_hours INTEGER     NOT NULL DEFAULT 40,
  role           TEXT        NOT NULL DEFAULT 'employee'
                             CHECK (role IN ('admin', 'employee')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekplanningen (één per medewerker per week)
CREATE TABLE week_plans (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE        NOT NULL,  -- altijd een maandag
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

-- Dagplanningen (0=maandag … 6=zondag)
CREATE TABLE day_plans (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  week_plan_id UUID    REFERENCES week_plans(id) ON DELETE CASCADE NOT NULL,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working   BOOLEAN NOT NULL DEFAULT FALSE,
  start_time   TIME,
  end_time     TIME,
  UNIQUE (week_plan_id, day_of_week)
);

-- Taken per dag
CREATE TABLE tasks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  day_plan_id UUID        REFERENCES day_plans(id) ON DELETE CASCADE NOT NULL,
  task_text   TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Taakreviews (één per taak)
CREATE TABLE task_reviews (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     UUID        REFERENCES tasks(id) ON DELETE CASCADE NOT NULL UNIQUE,
  completed   BOOLEAN     NOT NULL,
  reason      TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Hulpfunctie: is de huidige gebruiker admin?
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM profiles WHERE id = auth.uid()),
    FALSE
  )
$$;

-- ============================================================
-- Trigger: maak automatisch een profiel aan bij registratie
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, name, contract_hours)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Naamloos'),
    COALESCE((NEW.raw_user_meta_data->>'contract_hours')::INTEGER, 40)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reviews ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Eigen profiel lezen of admin" ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

CREATE POLICY "Eigen profiel bijwerken" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Week plans
CREATE POLICY "Eigen weekplannen of admin" ON week_plans
  FOR ALL USING (auth.uid() = user_id OR is_admin());

-- Day plans
CREATE POLICY "Eigen dagplannen of admin" ON day_plans
  FOR ALL USING (
    week_plan_id IN (SELECT id FROM week_plans WHERE user_id = auth.uid())
    OR is_admin()
  );

-- Tasks
CREATE POLICY "Eigen taken of admin" ON tasks
  FOR ALL USING (
    day_plan_id IN (
      SELECT d.id FROM day_plans d
      JOIN week_plans w ON d.week_plan_id = w.id
      WHERE w.user_id = auth.uid()
    )
    OR is_admin()
  );

-- Task reviews
CREATE POLICY "Eigen reviews of admin" ON task_reviews
  FOR ALL USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN day_plans d ON t.day_plan_id = d.id
      JOIN week_plans w ON d.week_plan_id = w.id
      WHERE w.user_id = auth.uid()
    )
    OR is_admin()
  );

-- ============================================================
-- Een medewerker admin maken:
-- UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid>';
-- ============================================================
