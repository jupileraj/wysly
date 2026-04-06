-- ============================================================
-- Wysly — Migratie v3
-- Weekplanning: taken per dag toevoegen
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- Weekdoelen per dag (suggesties vanuit de weekplanning)
CREATE TABLE week_goals (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  day_plan_id  UUID        REFERENCES day_plans(id) ON DELETE CASCADE NOT NULL,
  goal_text    TEXT        NOT NULL,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE week_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen weekdoelen of admin" ON week_goals
  FOR ALL USING (
    day_plan_id IN (
      SELECT d.id FROM day_plans d
      JOIN week_plans w ON d.week_plan_id = w.id
      WHERE w.user_id = auth.uid()
    )
    OR is_admin()
  );
