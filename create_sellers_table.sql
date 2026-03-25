-- Create the missing 'sellers' table
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for sellers
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust as needed for security)
CREATE POLICY "Allow public read-write for sellers" ON public.sellers
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Ensure 'seller_id' exists in 'visits' table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='visits' AND column_name='seller_id') THEN
        ALTER TABLE public.visits ADD COLUMN seller_id UUID REFERENCES public.sellers(id);
    END IF;
END $$;
