ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS chk_tasks_entity_type;
ALTER TABLE public.tasks ADD CONSTRAINT chk_tasks_entity_type
  CHECK (
    entity_type IS NULL
    OR entity_type = ANY (ARRAY[
      'fall', 'lead', 'abrechnung', 'reklamation',
      'sv_onboarding', 'gutachter', 'kunde', 'case',
      'termin', 'gutschrift', 'fall_dokumente'
    ])
  );;
