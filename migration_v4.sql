-- ============================================================
-- Wysly — Migratie v4
-- Week goals: van per-dag naar per-week, met klant
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- Verwijder oude tabel (was per day_plan)
DROP TABLE IF EXISTS week_goals;

-- Nieuwe tabel: doelen voor de gehele week
CREATE TABLE week_goals (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  week_plan_id UUID        REFERENCES week_plans(id) ON DELETE CASCADE NOT NULL,
  goal_text    TEXT        NOT NULL,
  client_id    UUID        REFERENCES clients(id) ON DELETE SET NULL,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE week_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen weekdoelen of admin" ON week_goals
  FOR ALL USING (
    week_plan_id IN (
      SELECT id FROM week_plans WHERE user_id = auth.uid()
    )
    OR is_admin()
  );
