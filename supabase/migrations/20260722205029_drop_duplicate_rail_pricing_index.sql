-- The unique constraint index supports both lookups and ON CONFLICT upserts.
-- This older non-unique index covers the same column and is redundant.
drop index if exists public.rail_pricing_type_idx;
