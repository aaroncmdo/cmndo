-- CMM-65 Part B — Finanz-ADDs: faelle-Finanzspalten additiv auf claims (SSoT).
--
-- Teil der CMM-44-Vollmigration (Claim-as-SSoT, faelle -> Phase-6-DROP). Diese
-- vier faelle-Spalten muessen vor dem Phase-6-DROP auf claims relocaten:
--   * marketing_provision        numeric(10,2)  (Partner-/CPL-Provision, z.B. Maik)
--   * marketing_provision_status text           (Status der Provision)
--   * marketing_quelle           text           (Marketing-Quelle/Kampagne)
--   * zahlungsweg                text           (Kunden-Auszahlungs-ZIEL:
--                                                {kundenkonto, werkstatt_direkt} —
--                                                NICHT claim_payments.zahlungsweg,
--                                                das die Zahlungs-METHODE ist)
--
-- SPEC-ERWEITERUNG: Der Handoff nennt nur marketing_provision + marketing_quelle
-- + zahlungsweg. marketing_provision_status wird hier MITGENOMMEN, weil es (a)
-- untrennbar zum marketing_provision-Konzept gehoert, (b) cov=0 + null Code-
-- Referenzen (nur generierte Typen) = dormant, und (c) in v_faelle_mit_aktuellem_
-- termin projiziert wird (siehe View-Repoint unten) — bliebe es auf faelle, waere
-- die View nach dem Phase-6-DROP kaputt. Reine additive Relocation, reversibel.
--
-- ADDITIV ONLY: kein faelle-DROP (faelle stirbt erst in Phase 6). Live verifiziert
-- 2026-05-26: alle vier Spalten sind auf faelle 0/59 non-null (cov=0), claims hat
-- KEINE der vier. leads hat KEINE marketing_provision/marketing_quelle-Quellspalte
-- (nur source_channel/source_domain — andere Semantik) -> Backfill-Quelle ist
-- ausschliesslich faelle, und die ist leer. Der IS-NULL-guarded Backfill ist daher
-- heute ein No-op, bleibt aber idempotent + faengt etwaige Werte zwischen diesem
-- PR und dem Code-Sweep (PR2) ab.

BEGIN;

-- 1) Spalten additiv anlegen (Typen = faelle-Quelltypen, alle nullable).
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS marketing_provision numeric(10,2);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS marketing_provision_status text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS marketing_quelle text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS zahlungsweg text;

-- 2) Backfill faelle -> claims (IS-NULL-guarded; heute 0 Zeilen, idempotent).
UPDATE public.claims c
   SET marketing_provision = f.marketing_provision
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.marketing_provision IS NOT NULL
   AND c.marketing_provision IS NULL;

UPDATE public.claims c
   SET marketing_provision_status = f.marketing_provision_status
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.marketing_provision_status IS NOT NULL
   AND c.marketing_provision_status IS NULL;

UPDATE public.claims c
   SET marketing_quelle = f.marketing_quelle
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.marketing_quelle IS NOT NULL
   AND c.marketing_quelle IS NULL;

UPDATE public.claims c
   SET zahlungsweg = f.zahlungsweg
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.zahlungsweg IS NOT NULL
   AND c.zahlungsweg IS NULL;

-- 3) View-Repoint v_faelle_mit_aktuellem_termin: die drei f.marketing_*-Projektionen
--    auf c.* (claims joint bereits als `c` ON c.id = f.claim_id; alle faelle haben
--    claim_id NOT NULL -> kein NULL-Regress aus dem LEFT JOIN). zahlungsweg war eine
--    NULL::text-Stub-Spalte (kein faelle-Read) -> auf die neue claims-SSoT zeigen
--    (cov=0 -> heute weiterhin NULL, aber forward-korrekt).
--
--    Technik wie CMM-66 PR2b (server-seitig, ohne JOIN-Surgery am 338-Spalten-View):
--    pg_get_viewdef + gezieltes replace() je Spalten-Expression + RAISE-no-op-Guard
--    + security_invoker-Preserve (CREATE OR REPLACE VIEW setzt Optionen sonst auf
--    Default zurueck). Spalten-Namen/-Typen bleiben identisch (numeric/text) ->
--    CREATE OR REPLACE zulaessig, database.types.ts unveraendert.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_secinv text;
BEGIN
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_faelle_mit_aktuellem_termin'::regclass;
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass);

  v_new := replace(v_def, 'f.marketing_provision,', 'c.marketing_provision,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.marketing_provision substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.marketing_provision_status,', 'c.marketing_provision_status,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.marketing_provision_status substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.marketing_quelle,', 'c.marketing_quelle,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.marketing_quelle substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'NULL::text AS zahlungsweg,', 'c.zahlungsweg AS zahlungsweg,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: NULL::text AS zahlungsweg substring not found (no-op)'; END IF;
  v_def := v_new;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_def;
  EXECUTE format('ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = %s)', v_secinv);
END $$;

COMMIT;
