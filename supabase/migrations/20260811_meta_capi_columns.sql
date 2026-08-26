-- Adiciona colunas para rastreio de eventos Meta CAPI na tabela de orçamentos.
-- meta_event_id:        UUID do evento enviado pro Meta (usado pra dedupe).
-- meta_event_sent_at:   Quando o evento foi disparado (pra reprocessamento).
-- meta_event_response:  Resposta crua do Meta (facebook trace_id etc) pra debug.
-- meta_event_name:      'Lead' (pendente) ou 'Purchase' (finalizado).

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS meta_event_id text,
  ADD COLUMN IF NOT EXISTS meta_event_name text,
  ADD COLUMN IF NOT EXISTS meta_event_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_event_response jsonb;

-- Índice pra deduplicação e pra queries de "orçamentos sem evento ainda".
CREATE INDEX IF NOT EXISTS idx_orcamentos_meta_event_id
  ON public.orcamentos (meta_event_id)
  WHERE meta_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_meta_event_sent_at
  ON public.orcamentos (meta_event_sent_at)
  WHERE meta_event_sent_at IS NULL;

COMMENT ON COLUMN public.orcamentos.meta_event_id
  IS 'Event ID retornado pela Meta CAPI — chave de dedupe entre server/browser';
COMMENT ON COLUMN public.orcamentos.meta_event_name
  IS 'Tipo de evento Meta: Lead (status=pendente) ou Purchase (status=finalizado)';
COMMENT ON COLUMN public.orcamentos.meta_event_sent_at
  IS 'Quando o evento foi enviado à Meta CAPI';
COMMENT ON COLUMN public.orcamentos.meta_event_response
  IS 'Raw response da Meta (events_received, trace_id, fbtrace_id) pra debug';
