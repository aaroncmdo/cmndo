-- CMM-49 Slice 2 (isolierte Spalte): claims.kanzlei_ansprechpartner_person_id droppen.
-- DB-verifiziert 10.07.: 0 View-Dep (pg_depend), 0 DB-Function (pg_proc), 0 Code-Ref (grep src ohne types),
-- 0 Daten. FK claims_kanzlei_ansprechpartner_person_id_fkey (single-column) wird mit der Spalte auto-dropped.
-- Der intendierte FK auf personen ist tot; die flachen kanzlei_ansprechpartner_{name,email,telefon,position}
-- sind der Live-Weg (bleiben). Rest von Slice 2 (view/code-gekoppelt) = Handoff an 470d55c9.
-- Register: BROADCAST-claims-leads-normalisierung-debt-register. Technik-Vorlage: Slice 1 Mig 20260710033821.
ALTER TABLE public.claims DROP COLUMN kanzlei_ansprechpartner_person_id;
