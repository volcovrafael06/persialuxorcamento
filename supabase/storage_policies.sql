-- Enable RLS for storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update and delete own files" ON storage.objects;

-- Create a simple public access policy for the images bucket
CREATE POLICY "Public Access to images bucket" ON storage.objects
  FOR ALL
  TO public
  USING (bucket_id = 'images')
  WITH CHECK (bucket_id = 'images');

-- Ensure the bucket is publicly accessible
UPDATE storage.buckets
SET public = true
WHERE name = 'images';
