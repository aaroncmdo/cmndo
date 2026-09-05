-- Teilkasko-Zugang (Aaron 05.09.2026): Die Schadenart kannte bisher nur Kollisionen
-- (spurwechsel, auffahrunfall, vorfahrtsverletzung, parkplatz, sonstiges). Ein Teilkasko-Ereignis
-- hat keinen Unfallgegner und passte in keine davon — es landete auf 'sonstiges' oder blieb leer.
--
-- Fachlicher Hintergrund: die Werkstattbindung gilt laut Wissensbasis fuer "Vollkasko UND Teilkasko
-- inkl. Glas" (17 von 23 Konditionen woertlich). Ein Hagelschaden bei einem SELECT-Tarif ist also
-- genauso gebunden wie ein Auffahrunfall. Zusaetzlich braucht die Glas-Erkennung einen eigenen Wert:
-- neun Tarife (KRAVAG, Signal Iduna, VOEDAG) binden NUR Glas — bei Karosserie bleibt der Kunde frei
-- (E7 Aaron 04.09.), bei einem echten Steinschlag ist er gebunden.
--
-- Reihenfolge nach AGENTS.md Flag-Drift-Gate: erst der CHECK, dann der Snapshot. Ohne diesen Schritt
-- verwirft Postgres die neuen Werte STILL (kein Fehler, keine Zeile) — genau die Klasse, die das Gate
-- verhindern soll.
alter table public.leads drop constraint if exists leads_schadentyp_check;

alter table public.leads add constraint leads_schadentyp_check check (
  schadentyp = any (array[
    -- Kollision (Bestand, unveraendert)
    'spurwechsel'::text,
    'auffahrunfall'::text,
    'vorfahrtsverletzung'::text,
    'parkplatz'::text,
    -- Teilkasko-Ereignisse ohne Unfallgegner (neu 05.09.2026)
    'hagel'::text,
    'sturm'::text,
    'marder'::text,
    'wild'::text,
    'glas'::text,
    'diebstahl'::text,
    -- Auffang (Bestand)
    'sonstiges'::text
  ])
);
