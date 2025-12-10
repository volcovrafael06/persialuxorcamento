-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create simplified policies without circular references
CREATE POLICY "Public profiles are viewable"
ON profiles 
FOR SELECT
TO public
USING (true);

-- Create policy for inserting profiles
CREATE POLICY "Users can insert their own profile"
ON profiles 
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating profiles
CREATE POLICY "Users can update own profile"
ON profiles 
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Create policy for deleting profiles
CREATE POLICY "Users can delete own profile"
ON profiles 
FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Grant necessary permissions
GRANT ALL ON profiles TO authenticated;
GRANT SELECT ON profiles TO anon;
