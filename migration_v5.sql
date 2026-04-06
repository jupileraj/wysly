-- Koppel taken aan weekdoelen zodat voltooiing zichtbaar is op de planningspagina
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS week_goal_id uuid REFERENCES week_goals(id) ON DELETE SET NULL;
