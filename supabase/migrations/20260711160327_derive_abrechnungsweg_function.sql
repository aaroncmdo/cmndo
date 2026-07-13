-- #2 abrechnungsweg pure-derived (Aaron 11.07.): SSoT-Ableitungslogik als IMMUTABLE-Funktion.
-- Ersetzt den write-once-Cache claims.abrechnungsweg — die Views leiten abrechnungsweg live hieraus ab
-- (aus service_typ + schuldfrage + eigene_versicherung + schadenart). Logik = resolveAbrechnungsweg
-- (src/lib/werkstatt/abrechnungsweg.ts) + nur_gutachter->'nicht_zutreffend' (kein Regulierungs-/Zahlweg-
-- Konzept) + schadenart=haftpflicht als Fallback wenn schuldfrage unbekannt. Safety-Check: reproduziert
-- 17/18 gespeicherte Werte (1 Abweichung = Test-Claim 29dd7ad5 ohne Determinanten; pure-derived akzeptiert).
CREATE OR REPLACE FUNCTION public.derive_abrechnungsweg(
  p_service_typ text,
  p_schuldfrage text,
  p_eigene_versicherung text,
  p_schadenart text
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_service_typ = 'nur_gutachter' THEN 'nicht_zutreffend'
    WHEN p_schuldfrage = 'gegner' THEN 'haftpflicht'
    WHEN p_schuldfrage = 'eigenverantwortung' AND p_eigene_versicherung = 'ja' THEN 'kasko'
    WHEN p_schuldfrage = 'eigenverantwortung' AND p_eigene_versicherung = 'nein' THEN 'selbstzahler'
    WHEN p_schuldfrage IS NULL AND p_schadenart = 'haftpflicht' THEN 'haftpflicht'
    ELSE NULL
  END
$$;
