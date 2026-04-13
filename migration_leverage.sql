-- Voeg leverage kolom toe aan tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS leverage TEXT CHECK (leverage IN ('high', 'low'));
