-- 1. Create the missing 'sellers' table
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for sellers
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sellers' AND policyname = 'Allow public read-write for sellers'
    ) THEN
        CREATE POLICY "Allow public read-write for sellers" ON public.sellers
            FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Ensure 'seller_id' exists in 'visits' table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='visits' AND column_name='seller_id') THEN
        ALTER TABLE public.visits ADD COLUMN seller_id UUID REFERENCES public.sellers(id);
    END IF;
END $$;

-- 3. Create 'images' storage bucket if it doesn't exist
-- Note: This requires the storage extension to be enabled (usually is).
INSERT INTO storage.buckets (id, name, public)
SELECT 'images', 'images', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'images'
);

-- 4. Set up storage policies for the 'images' bucket
-- These policies allow public access to the 'images' bucket.
DO $$
BEGIN
    -- Policy for viewing images
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Images'
    ) THEN
        CREATE POLICY "Public Access to Images" ON storage.objects
            FOR SELECT TO public USING (bucket_id = 'images');
    END IF;

    -- Policy for inserting images
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public uploads to Images'
    ) THEN
        CREATE POLICY "Allow public uploads to Images" ON storage.objects
            FOR INSERT TO public WITH CHECK (bucket_id = 'images');
    END IF;
END $$;
