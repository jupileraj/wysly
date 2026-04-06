-- ============================================================
-- Wysly — Migratie v2
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- Klanten tabel
CREATE TABLE clients (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpvraag per werkdag (op day_plans)
ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS help_text TEXT;

-- Klant per taak (optioneel)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- ============================================================
-- RLS voor clients
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Iedereen die ingelogd is kan klanten lezen
CREATE POLICY "Klanten lezen" ON clients
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Iedereen die ingelogd is kan klanten aanmaken
CREATE POLICY "Klanten aanmaken" ON clients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Alleen admin kan klanten bijwerken of verwijderen
CREATE POLICY "Klanten bijwerken (admin)" ON clients
  FOR UPDATE USING (is_admin());

CREATE POLICY "Klanten verwijderen (admin)" ON clients
  FOR DELETE USING (is_admin());
