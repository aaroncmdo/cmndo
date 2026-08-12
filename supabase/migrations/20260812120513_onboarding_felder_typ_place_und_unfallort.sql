-- Ops-Test 11.08. (RC-8) / D1 Stufe 2: Feldtyp 'place' erlauben + Unfallort umstellen.
--
-- BEFUND: #5201 hat den Feldtyp 'place' im geteilten FieldRenderer eingefuehrt
-- (case 'place' -> PlaceField -> GooglePlaceAutocomplete, seit Release R290 auf main),
-- aber die DB-Seite nicht nachgezogen: onboarding_felder_typ_check kannte 'place' nicht.
-- Das im Handoff vorgesehene reine Daten-Update
--   update onboarding_felder set typ='place' where feld_key='unfallort'
-- schlaegt daher mit 23514 fehl. Der Constraint muss zuerst erweitert werden -- sonst
-- bleibt der neue Feldtyp dauerhaft unbenutzbar.
--
-- Reihenfolge ist zwingend: erst Constraint (sonst 23514), dann Daten. Beides in EINER
-- Migration, damit kein Zustand entsteht, in dem der Typ erlaubt, aber nicht gesetzt ist.
--
-- WARUM ERST JETZT: Das Daten-Update durfte nicht vor dem Code-Deploy laufen -- haette es
-- den Typ vorher gesetzt, haette prod einen unbekannten Feldtyp gerendert und das
-- Unfallort-Feld waere aus dem Formular verschwunden. Deploy ist verifiziert (case 'place'
-- liegt auf origin/main).
--
-- AUSLOESER: 'unfallort' war typ='text' (reiner Freitext); prod-Beleg: Test-Lead trug
-- 'Ecke Wiesenstrasse' bei unfallort_lat/lng = NULL. Der Ort war damit weder kartierbar
-- noch als Anker fuer die Unfallskizze nutzbar.
--
-- WIRKUNG: Adress-Autocomplete statt Freitext. Freitext bleibt ausdruecklich erlaubt
-- (PlaceField uebernimmt jede Eingabe) -- unpraezise Unfallorte wie Feldweg, Kreuzung
-- oder Parkplatz bleiben erfassbar. Das serverseitige Geocoding
-- (flow/[token]/self-service-feststellung-actions.ts:46-66) haengt am WERT, nicht am Typ,
-- lief also schon vorher; der Autocomplete verbessert nur seine Trefferquote.
--
-- ROLLBACK: update onboarding_felder set typ='text' where feld_key='unfallort';
-- (Der erweiterte Constraint kann bleiben -- er ist rein additiv.)

-- 1) Constraint additiv um 'place' erweitern (Liste sonst unveraendert, 17 -> 18 Typen).
alter table public.onboarding_felder
  drop constraint onboarding_felder_typ_check;

alter table public.onboarding_felder
  add constraint onboarding_felder_typ_check
  check (typ = any (array[
    'text', 'email', 'tel', 'number', 'textarea', 'segmented', 'toggle-cards',
    'select', 'slot', 'signature', 'file', 'checkbox', 'zb1-upload', 'termin',
    'phone-verify', 'avatar-upload', 'calendar-connect', 'place'
  ]));

-- 2) Genau die eine Unfallort-Zeile umstellen (db_target leads.unfallort).
--    Der typ='text'-Guard macht den Lauf wiederholbar.
update public.onboarding_felder
set typ = 'place'
where feld_key = 'unfallort'
  and typ = 'text';
