-- Admin-Schalter: erscheint dieser Sachverstaendige im KI-/GEO-Kanal?
--
-- Bis hierher entschied das allein ist_aktiv + verifiziert + Isochrone. Damit war
-- "im Netz aktiv" und "wird KI-Assistenten als buchbar genannt" dasselbe — ein SV,
-- der Termine ueber Dispatch annimmt, aber nicht oeffentlich auf Stadtseiten und in
-- ChatGPT-Antworten auftauchen soll, liess sich nicht abbilden.
--
-- DEFAULT TRUE ist Absicht: alle bestehenden SVs bleiben sichtbar. Ein Default FALSE
-- wuerde den gesamten GEO-Kanal mit dieser Migration stumm schalten.
alter table public.sachverstaendige
  add column if not exists ki_sichtbar boolean not null default true;

comment on column public.sachverstaendige.ki_sichtbar is
  'Admin-Toggle: SV erscheint im KI-/GEO-Kanal (Stadtseiten-Termine, Verfuegbarkeits-Streifen, oeffentliche Termin-API). Default true. Unabhaengig von ist_aktiv — ein SV kann intern arbeiten, ohne oeffentlich als buchbar genannt zu werden.';
