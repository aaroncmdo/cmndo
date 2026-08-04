-- Abrechnungsweg-Ableiter-Vereinheitlichung (Problem B): den nur_gutachter-Sonderfall aus
-- derive_abrechnungsweg entfernen. Er produzierte 'nicht_zutreffend' — einen Wert, den die
-- claims.abrechnungsweg-Spalte per CHECK nicht halten kann und den KEIN Code konsumiert (nur 1 Test),
-- und war die einzige verbleibende Divergenz-Quelle zwischen der App-gesetzten Spalte
-- (resolveAbrechnungsweg, kennt kein service_typ) und den 3 Views (v_claim_base/-phase/
-- -werkstatt_auftrag). Ohne den Zweig faellt nur_gutachter durch zu schuldfrage -> haftpflicht =
-- exakt was die Spalte schon haelt (12 nur_gutachter-Claims werden konsistent, 0 Backfill noetig).
-- abrechnungsweg = Schaden-Natur (haftpflicht/kasko/selbstzahler), unabhaengig vom Service-Umfang.
-- p_service_typ bleibt Parameter (die 3 Views rufen mit 4 Args) — ungenutzt, kein View-Umbau noetig.
CREATE OR REPLACE FUNCTION public.derive_abrechnungsweg(p_service_typ text, p_schuldfrage text, p_eigene_versicherung text, p_schadenart text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_schuldfrage = 'gegner' THEN 'haftpflicht'
    WHEN p_schuldfrage = 'eigenverantwortung' AND p_eigene_versicherung = 'ja' THEN 'kasko'
    WHEN p_schuldfrage = 'eigenverantwortung' AND p_eigene_versicherung = 'nein' THEN 'selbstzahler'
    WHEN p_schuldfrage IS NULL AND p_schadenart = 'haftpflicht' THEN 'haftpflicht'
    ELSE NULL
  END
$function$;

-- Backfill: die eine verbleibende Spalte-vs-Funktion-Divergenz (Spalte=NULL trotz ableitbarem Weg).
-- Scope vorab verifiziert = genau 1 Row (CLM-2026-00950: schuldfrage=gegner -> haftpflicht). Nur
-- angleichen, wo die Funktion einen haltbaren Wert liefert (haftpflicht/kasko/selbstzahler).
UPDATE claims c
SET abrechnungsweg = derive_abrechnungsweg(c.service_typ, l.schuldfrage, l.eigene_versicherung, c.schadenart)
FROM leads l
WHERE l.id = c.lead_id
  AND c.abrechnungsweg IS DISTINCT FROM derive_abrechnungsweg(c.service_typ, l.schuldfrage, l.eigene_versicherung, c.schadenart)
  AND derive_abrechnungsweg(c.service_typ, l.schuldfrage, l.eigene_versicherung, c.schadenart) IS NOT NULL;
