-- CMM-49 ENDGAME (GO #2, Aaron + ab96fed4 Engine-Owner): DROP COLUMN gutachter_termine.sv_id.
-- Lossless: svid_divergent=0 (sv_id ≡ assignee_id fuer alle SV-Termine), assignee_id_null=0.
-- Alle Reader/Writer auf assignee (live staging+main via #2662/#2664/B17), RLS + v_belegung +
-- v_faelle repointed (pg_depend@gt.sv_id vor diesem Schritt = nur noch {FK, Index, normalize-Trigger}).
-- NO CASCADE: FK + Index fallen automatisch mit der Spalte; ein unerwarteter Dependent wuerde den
-- DROP sauber abbrechen statt zu cascaden. Bereits via apply_migration appliziert (recorded
-- 20260611131524) + post-DROP verifiziert (col weg, gt/v_faelle/v_belegung queryable, FK/Index/
-- normalize-Trigger weg, validate_assignee-Trigger + Exclusion-Constraint ueberleben).

-- 1. normalize-Trigger retiren (las NEW.sv_id; nach Writer-Flip schreiben alle Writer assignee direkt -> no-op).
DROP TRIGGER IF EXISTS trg_gutachter_termine_normalize_assignee ON gutachter_termine;
DROP FUNCTION IF EXISTS gutachter_termine_normalize_assignee();

-- 2. DROP COLUMN (FK gutachter_termine_sv_id_fkey + Index idx_gutachter_termine_sv_gesehen fallen auto mit).
ALTER TABLE gutachter_termine DROP COLUMN sv_id;
