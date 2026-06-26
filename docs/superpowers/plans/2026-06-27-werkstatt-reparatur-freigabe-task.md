# Auto-Task „Reparaturfreigabe erteilen" (Gutachten-Eingang → KB) — Plan

> Erweiterung von PR #3242 (Werkstatt-Vermittlungen + Reparaturfreigabe). Design in-conversation approved (Aaron, 2026-06-27): bei Gutachten-Fertigstellung automatisch ein Task für den zuständigen KB „Reparaturfreigabe erteilen"; erledigt sich beim Erteilen selbst. DB-only (keine JS-Task-Engine, kein UI — Task erscheint in der bestehenden KB-Task-UI).

## Design-Kontext (verifiziert)
- **„Gutachten da"-Signal** = `gutachten.fertiggestellt_am` (CMM-44 SSoT; `claims.gutachten_eingegangen_am` existiert nicht mehr). `gutachten.claim_id` → claims.
- **Task-Routing:** `tasks.claim_id` = kanonisch (90/90 valide); `tasks.fall_id` = Bridge-fall_id (Fallakte-Query `.eq('fall_id', route-id)`); `zugewiesen_an`+`empfaenger_user_id`=`claims.kundenbetreuer_id`, `empfaenger_rolle='kundenbetreuer'` (KB-Liste/TasksPill). Jede claim hat eine `faelle_claim_bridge`-Zeile (0 ohne).
- **CHECKs:** `prioritaet` ∈ {normal,dringend,kritisch} → **`dringend`**; `typ` ohne CHECK → `reparatur_freigabe`; `status`-Enum {offen,in-bearbeitung,erledigt,blockiert}.
- **Security:** Trigger-Funktionen `SECURITY DEFINER SET search_path` (Insert läuft auch wenn der SV/OCR den Gutachten-Abschluss auslöst) + `REVOKE FROM PUBLIC, anon, authenticated` (Trigger-Funktionen, nicht direkt callable — Staffelung-Lehre).

## Task 1: DB-Migration (2 Trigger) via Supabase-Plugin

- [ ] **Step 1: `apply_migration({ name: 'reparatur_freigabe_task', query: <DDL> })`:**

```sql
-- (A) Gutachten fertig -> KB-Task „Reparaturfreigabe erteilen" (werkstatt-vermittelt, idempotent)
CREATE OR REPLACE FUNCTION public.trg_reparatur_freigabe_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_werkstatt_id uuid; v_kb_id uuid; v_freigegeben timestamptz; v_fall_id uuid;
BEGIN
  IF NEW.fertiggestellt_am IS NULL OR NEW.claim_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.werkstatt_id, c.kundenbetreuer_id, c.reparatur_freigegeben_am
    INTO v_werkstatt_id, v_kb_id, v_freigegeben FROM public.claims c WHERE c.id = NEW.claim_id;
  IF v_werkstatt_id IS NULL OR v_freigegeben IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE claim_id = NEW.claim_id AND task_code = 'reparatur_freigabe') THEN
    RETURN NEW;  -- idempotent
  END IF;
  SELECT b.fall_id INTO v_fall_id FROM public.faelle_claim_bridge b WHERE b.claim_id = NEW.claim_id;
  INSERT INTO public.tasks (
    claim_id, fall_id, typ, task_code, trigger_event, titel, beschreibung,
    status, prioritaet, empfaenger_rolle, empfaenger_user_id, zugewiesen_an, auto_erstellt, faellig_am
  ) VALUES (
    NEW.claim_id, v_fall_id, 'reparatur_freigabe', 'reparatur_freigabe', 'gutachten_fertiggestellt',
    'Reparaturfreigabe für die Werkstatt erteilen',
    'Das Gutachten ist fertig. Bitte die Reparaturfreigabe für die vermittelnde Werkstatt erteilen (Fallakte → Werkstatt-Vermittlung).',
    'offen', 'dringend', 'kundenbetreuer', v_kb_id, v_kb_id, true, now() + interval '1 day'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reparatur_freigabe_task ON public.gutachten;
CREATE TRIGGER trg_reparatur_freigabe_task
  AFTER INSERT OR UPDATE OF fertiggestellt_am ON public.gutachten
  FOR EACH ROW EXECUTE FUNCTION public.trg_reparatur_freigabe_task();

-- (B) Auto-Resolve bei Erteilung; Re-Open bei Zuruecknahme (symmetrisch)
CREATE OR REPLACE FUNCTION public.trg_reparatur_freigabe_task_resolve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reparatur_freigegeben_am IS NOT NULL AND OLD.reparatur_freigegeben_am IS NULL THEN
    UPDATE public.tasks SET status='erledigt', erledigt_am=now(),
           auto_resolved_am=now(), auto_resolved_grund='reparatur_freigegeben'
     WHERE claim_id=NEW.id AND task_code='reparatur_freigabe' AND status IN ('offen','in-bearbeitung');
  ELSIF NEW.reparatur_freigegeben_am IS NULL AND OLD.reparatur_freigegeben_am IS NOT NULL THEN
    UPDATE public.tasks SET status='offen', erledigt_am=NULL, auto_resolved_am=NULL, auto_resolved_grund=NULL
     WHERE claim_id=NEW.id AND task_code='reparatur_freigabe' AND status='erledigt'
       AND auto_resolved_grund='reparatur_freigegeben';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reparatur_freigabe_task_resolve ON public.claims;
CREATE TRIGGER trg_reparatur_freigabe_task_resolve
  AFTER UPDATE OF reparatur_freigegeben_am ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_reparatur_freigabe_task_resolve();

REVOKE ALL ON FUNCTION public.trg_reparatur_freigabe_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_reparatur_freigabe_task_resolve() FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2:** `list_migrations` → Version `<V>` → File `supabase/migrations/<V>_reparatur_freigabe_task.sql` (== Version) committen.
- [ ] **Step 3:** `get_advisors({type:'security'})` → keine neuen Lints auf den 2 Funktionen (anon-revoked + search_path).
- [ ] **Step 4 (DB-Smoke, transactional RAISE-Rollback):** Für einen werkstatt-Claim ohne Freigabe: `gutachten.fertiggestellt_am` setzen → genau 1 `reparatur_freigabe`-Task (offen, KB-zugewiesen) entsteht; 2. Set → kein Duplikat; `claims.reparatur_freigegeben_am` setzen → Task `erledigt`; auf NULL → wieder `offen`. Für nicht-werkstatt-Claim: 0 Tasks. ROLLBACK.
- [ ] **Step 5: Commit** (Migration-File, Audit-Body).

## Task 2: PR-Update
- [ ] An Branch `kitta/werkstatt-vermittlungen-freigabe` committen + pushen (aktualisiert PR #3242). Kein neuer PR.

## Self-Review
- Spec-Coverage: Trigger-on-fertiggestellt (A) ✓, KB-Routing (zugewiesen_an+rolle) ✓, werkstatt-scope ✓, idempotent ✓, Auto-Resolve+Re-Open (B) ✓, Security (definer+revoke) ✓. CHECK-konform (prioritaet=dringend). Kein UI/TS (Task in bestehender KB-UI).
