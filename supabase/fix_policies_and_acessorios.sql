-- Drop existing policies for accessories if they exist
DROP POLICY IF EXISTS "accessories_select_policy" ON accessories;
DROP POLICY IF EXISTS "accessories_insert_policy" ON accessories;
DROP POLICY IF EXISTS "accessories_update_policy" ON accessories;
DROP POLICY IF EXISTS "accessories_delete_policy" ON accessories;

-- Drop and recreate accessories table with proper column definitions
DROP TABLE IF EXISTS accessories CASCADE;

CREATE TABLE accessories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR NOT NULL,
    unit VARCHAR NOT NULL,
    colors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    organization_id UUID
);

-- Enable RLS on accessories
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;

-- Create policies for accessories
CREATE POLICY "accessories_select_policy" 
ON accessories FOR SELECT 
TO authenticated 
USING (
    auth.uid() = created_by 
    OR 
    EXISTS (
        SELECT 1 FROM user_profiles up 
        WHERE up.user_id = auth.uid() 
        AND up.organization_id = accessories.organization_id
    )
);

CREATE POLICY "accessories_insert_policy" 
ON accessories FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() IS NOT NULL
);

CREATE POLICY "accessories_update_policy" 
ON accessories FOR UPDATE 
TO authenticated 
USING (
    auth.uid() = created_by 
    OR 
    EXISTS (
        SELECT 1 FROM user_profiles up 
        WHERE up.user_id = auth.uid() 
        AND up.organization_id = accessories.organization_id
    )
);

CREATE POLICY "accessories_delete_policy" 
ON accessories FOR DELETE 
TO authenticated 
USING (
    auth.uid() = created_by 
    OR 
    EXISTS (
        SELECT 1 FROM user_profiles up 
        WHERE up.user_id = auth.uid() 
        AND up.organization_id = accessories.organization_id
    )
);

-- Create or replace trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_accessories_updated_at ON accessories;
CREATE TRIGGER update_accessories_updated_at
    BEFORE UPDATE ON accessories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
