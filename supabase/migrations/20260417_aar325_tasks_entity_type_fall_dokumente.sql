-- AAR-325: tasks.entity_type-CHECK-Constraint um 'fall_dokumente' erweitern,
-- damit der Auto-Task-Trigger (fall_dokumente_autotask) seine Einträge mit
-- entity_type='fall_dokumente' einfügen kann.
--
-- Applied via Supabase MCP apply_migration am 2026-04-17.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS chk_tasks_entity_type;
ALTER TABLE public.tasks ADD CONSTRAINT chk_tasks_entity_type
  CHECK (
    entity_type IS NULL
    OR entity_type = ANY (ARRAY[
      'fall', 'lead', 'abrechnung', 'reklamation',
      'sv_onboarding', 'gutachter', 'kunde', 'case',
      'termin', 'gutschrift', 'fall_dokumente'
    ])
  );
