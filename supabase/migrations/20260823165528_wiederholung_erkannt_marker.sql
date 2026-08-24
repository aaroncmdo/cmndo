-- Sichtbarkeit fuer Dispatch: dieselbe Telefonnummer hat bereits frueher
-- angefragt. BEWUSST ein eigenes Feld statt leads.notiz — das nutzt das Team
-- selbst, und ein automatischer Schreiber wuerde dort fremden Text ueberschreiben
-- oder unkontrolliert anhaengen.
--
-- Gesetzt wird es aktuell NUR ueber den Gewinnspiel-Dedup: wenn
-- registriereTeilnahme auf den Unique-Index (kampagne_id, telefon_normalisiert)
-- laeuft, ist die aktuelle Anfrage nachweislich eine Wiederholung derselben
-- Person. Ohne laufende Kampagne bleibt die Spalte leer — der Name sagt
-- deshalb "erkannt", nicht "ist".
alter table public.gutachter_finder_anfragen
  add column if not exists wiederholung_erkannt_am timestamptz;

comment on column public.gutachter_finder_anfragen.wiederholung_erkannt_am is
  'Zeitpunkt, zu dem diese Anfrage als Wiederholung derselben Telefonnummer erkannt wurde (aktuell nur ueber den Gewinnspiel-Dedup gesetzt). Reiner Hinweis fuer Dispatch, keine Steuerung.';

alter table public.leads
  add column if not exists wiederholung_erkannt_am timestamptz;

comment on column public.leads.wiederholung_erkannt_am is
  'Zeitpunkt, zu dem dieser Lead als Wiederholung derselben Telefonnummer erkannt wurde (aktuell nur ueber den Gewinnspiel-Dedup gesetzt). Reiner Hinweis fuer Dispatch, keine Steuerung.';
