-- CMM-61 — Kanzlei-Provision-ADDs: faelle-Kanzlei-Provisionsspalten additiv auf claims (SSoT).
--
-- Teil der CMM-44-Vollmigration (Claim-as-SSoT, faelle -> Phase-6-DROP). Diese drei
-- faelle-Spalten muessen vor dem Phase-6-DROP auf claims relocaten:
--   * kanzlei_honorar                 numeric(10,2)  (Kanzlei-Honorar je Mandat)
--   * kanzlei_provision_status        text           (Lifecycle: offen -> berechtigt
--                                                      -> abgerechnet -> ausgezahlt)
--   * kanzlei_provision_ausgezahlt_am timestamptz    (Auszahlungs-Zeitstempel)
--
-- ZIEL = claims (Aaron-Entscheidung 2026-05-26): claims ist 1:1 mit faelle (60 >= 59),
-- jeder Fall hat damit eine Heimat (kanzlei_faelle hat nur 12 Rows -> die ~47 faelle
-- ohne Kanzlei-Fall haetten dort keine). Zudem wird kanzlei_honorar im selben Finance-
-- Aggregat wie marketing_provision gelesen (fall-finanzen / analytics/finance), das
-- CMM-65 Part B gerade nach claims gezogen hat -> Co-Location haelt das Finance-Read
-- auf einer Tabelle.
--
-- ADDITIV ONLY: kein faelle-DROP (faelle stirbt erst in Phase 6). Live verifiziert
-- 2026-05-26: kanzlei_honorar 0/59 + kanzlei_provision_ausgezahlt_am 0/59 (cov=0);
-- kanzlei_provision_status 59/59 = ausschliesslich der Spalten-Default 'offen' (1
-- distinct value, keine echten Daten). Das Provisions-Konzept ist damit dormant. Die
-- Relocation ist reine Struktur, reversibel, value-neutral.
--
-- gutachter_honorar (SV-Honorar, OCR-geschrieben) ist NICHT Teil dieser Slice
-- (Aaron: separat/spaeter) und bleibt unberuehrt — nur in faelle_sv_view projiziert,
-- nicht hier.

BEGIN;

-- 1) Spalten additiv anlegen (Typen + Default = faelle-Quelle).
--    kanzlei_provision_status erhaelt den faelle-Default 'offen' -> alle 60 bestehenden
--    claims-Rows bekommen sofort 'offen' (= identisch zu faelle's universellem 'offen'),
--    neue claims-Rows starten wie zuvor bei 'offen'. honorar/ausgezahlt_am bleiben
--    default-frei (nullable), wie auf faelle.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS kanzlei_honorar numeric(10,2);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS kanzlei_provision_status text DEFAULT 'offen'::text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS kanzlei_provision_ausgezahlt_am timestamptz;

-- 2) Backfill faelle -> claims (idempotent, heute No-op).
--    honorar/ausgezahlt_am: IS-NULL-guarded (cov=0 -> 0 Zeilen).
UPDATE public.claims c
   SET kanzlei_honorar = f.kanzlei_honorar
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.kanzlei_honorar IS NOT NULL
   AND c.kanzlei_honorar IS NULL;

UPDATE public.claims c
   SET kanzlei_provision_ausgezahlt_am = f.kanzlei_provision_ausgezahlt_am
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.kanzlei_provision_ausgezahlt_am IS NOT NULL
   AND c.kanzlei_provision_ausgezahlt_am IS NULL;

--    status: der ADD-Default 'offen' fuellt alle Rows -> ein IS-NULL-Guard wuerde nie
--    greifen. Stattdessen jeden faelle-Status uebernehmen, der vom unberuehrten
--    Default abweicht (heute 0 Zeilen, da alle faelle 'offen'). c-Seite nur ueber-
--    schreiben solange sie noch am Default 'offen' steht (kein claims-Writer war hier).
UPDATE public.claims c
   SET kanzlei_provision_status = f.kanzlei_provision_status
  FROM public.faelle f
 WHERE f.claim_id = c.id
   AND f.kanzlei_provision_status IS NOT NULL
   AND f.kanzlei_provision_status <> 'offen'
   AND c.kanzlei_provision_status = 'offen';

-- 3) View-Repoint v_faelle_mit_aktuellem_termin: die drei f.kanzlei_*-Projektionen auf
--    c.* (claims joint bereits als `c` ON c.id = f.claim_id; alle faelle haben claim_id
--    NOT NULL -> kein NULL-Regress). Einzige View die diese drei Spalten projiziert
--    (live verifiziert; faelle_sv_view matcht nur ueber gutachter_honorar = out-of-scope).
--
--    Technik wie CMM-65 Part B / CMM-66 PR2b (server-seitig, ohne JOIN-Surgery am
--    338-Spalten-View): pg_get_viewdef + gezieltes replace() je Spalten-Expression +
--    RAISE-no-op-Guard + security_invoker-Preserve. Spalten-Namen/-Typen bleiben
--    identisch -> CREATE OR REPLACE zulaessig, database.types.ts unveraendert.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_secinv text;
BEGIN
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
    INTO v_secinv FROM pg_class c WHERE c.oid = 'public.v_faelle_mit_aktuellem_termin'::regclass;
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass);

  v_new := replace(v_def, 'f.kanzlei_honorar,', 'c.kanzlei_honorar,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.kanzlei_honorar substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.kanzlei_provision_status,', 'c.kanzlei_provision_status,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.kanzlei_provision_status substring not found (no-op)'; END IF;
  v_def := v_new;

  v_new := replace(v_def, 'f.kanzlei_provision_ausgezahlt_am,', 'c.kanzlei_provision_ausgezahlt_am,');
  IF v_new = v_def THEN RAISE EXCEPTION 'v_faelle_mit_aktuellem_termin: f.kanzlei_provision_ausgezahlt_am substring not found (no-op)'; END IF;
  v_def := v_new;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_def;
  EXECUTE format('ALTER VIEW public.v_faelle_mit_aktuellem_termin SET (security_invoker = %s)', v_secinv);
END $$;

COMMIT;
