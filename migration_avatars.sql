-- Voer uit in Supabase SQL Editor

-- 1. Avatar URL kolom toevoegen aan profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Storage bucket aanmaken (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies voor storage
CREATE POLICY "Avatars publiek zichtbaar"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Gebruiker kan eigen avatar uploaden"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Gebruiker kan eigen avatar updaten"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
