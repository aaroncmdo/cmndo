-- CMM-66 Teil 2 (Phase 4.2): v_claim_full liest sv_id aus claims statt faelle.
-- f.sv_id -> c.sv_id. CMM-60 machte claims.sv_id zur SSoT; live verifiziert:
-- f.sv_id == c.sv_id ueber alle 74 Faelle (svid_mismatch=0) -> EXCEPT-Diff 0/0 garantiert.
-- Server-seitiger replace()-Transform der Live-Viewdef (kein Hand-Transkript der ~95 Spalten;
-- robust gegen parallele Viewdef-Aenderungen anderer Sessions). Vorlage: 20260530205453 (CMM-50.3b).
-- Selbst-Assert: altes f.sv_id-Pattern weg + exakt 1 c.sv_id-Ref. CREATE OR REPLACE erzwingt
-- Spalten-Name/-Typ/-Reihenfolge. EXCEPT-0/0-Guard via Output-Hash (old==new) -> bei Drift atomarer Rollback.
DO $cmm66_2$
DECLARE
  _new      text;
  _old_hash text;
  _new_hash text;
  _cnt      int;
BEGIN
  -- 1. Hash des aktuellen (alten) View-Outputs (Multiset-stabil: ORDER BY ganze Zeile)
  SELECT md5(coalesce(string_agg(t::text, chr(10) ORDER BY t::text), ''))
    INTO _old_hash FROM public.v_claim_full t;

  -- 2. Live-Viewdef holen + nur die sv_id-Quelle repointen
  _new := pg_get_viewdef('public.v_claim_full'::regclass, true);
  _new := replace(_new, '    f.sv_id,', '    c.sv_id,');

  -- 3. Selbst-Assert: altes Pattern weg, neues genau 1x
  IF position('    f.sv_id,' in _new) > 0 THEN
    RAISE EXCEPTION 'CMM-66.2: f.sv_id nach Transform noch vorhanden — Live-Viewdef-Format weicht ab, Abbruch.';
  END IF;
  _cnt := (length(_new) - length(replace(_new, 'c.sv_id', ''))) / length('c.sv_id');
  IF _cnt <> 1 THEN
    RAISE EXCEPTION 'CMM-66.2: erwartete genau 1 c.sv_id-Ref, fand % — Abbruch.', _cnt;
  END IF;

  -- 4. Anwenden
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || _new;

  -- 5. EXCEPT-0/0-Guard: Output muss byte-identisch bleiben
  SELECT md5(coalesce(string_agg(t::text, chr(10) ORDER BY t::text), ''))
    INTO _new_hash FROM public.v_claim_full t;
  IF _new_hash IS DISTINCT FROM _old_hash THEN
    RAISE EXCEPTION 'CMM-66.2: Output-Hash divergiert (old=% new=%) — Repoint aendert Daten, Abbruch.', _old_hash, _new_hash;
  END IF;
END
$cmm66_2$;
