-- reload_schema_cache.sql
-- Run this in the Supabase SQL Editor if you get a "Could not find the 'column_name' column in the schema cache" error.

NOTIFY pgrst, 'reload schema';
