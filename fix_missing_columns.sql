-- fix_missing_columns.sql
-- Run this in Supabase SQL Editor to add missing columns to 'configuracoes'

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='configuracoes' AND column_name='bando_custo') THEN
        ALTER TABLE public.configuracoes ADD COLUMN bando_custo NUMERIC DEFAULT 80;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='configuracoes' AND column_name='bando_venda') THEN
        ALTER TABLE public.configuracoes ADD COLUMN bando_venda NUMERIC DEFAULT 120;
    END IF;
END $$;
