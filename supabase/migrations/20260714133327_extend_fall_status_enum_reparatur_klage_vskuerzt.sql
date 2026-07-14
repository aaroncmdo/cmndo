-- Cast-Bug-Fix: v_claim_base / v_faelle_mit_aktuellem_termin / faelle_kunde_view /
-- faelle_sv_view / v_claim_full casten claims.operative_status::fall_status. Die
-- state-machine (FALL_STATUS_TRANSITIONS) schreibt aber 6 Werte, die NICHT im Enum
-- waren (Selbstzahler-Reparatur-Track + klage + vs-kuerzt) -> der Cast bricht, sobald
-- ein solcher Claim existiert (latent, weil claims prod aktuell leer ist). Additiver
-- Enum-Extend (Vokabular = tatsaechlich geschriebene Werte). ADD VALUE ist non-destruktiv,
-- kein View-Shape-Change. Gefunden im B0-Hardening der Status-Achsen-Konsolidierung.
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'reparatur-werkstatt-suche';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'reparatur-angefragt';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'reparatur-laeuft';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'reparatur-erledigt';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'vs-kuerzt';
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'klage';
