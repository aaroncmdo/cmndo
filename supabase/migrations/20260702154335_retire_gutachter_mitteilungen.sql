-- Phase 5 (Updates-Feld-Cleanup): gutachter_mitteilungen retiren.
-- Code referenziert die Tabelle seit #3437 nicht mehr (SV-Notifs laufen ueber die
-- kanonische mitteilungen). Die verbliebenen, NICHT derived-abgedeckten Zeilen
-- werden nach mitteilungen gebackfillt (empfaenger = sachverstaendige.profile_id,
-- kategorie='update', Prioritaet analog classifyGutachterMitteilung), dann DROP.
insert into public.mitteilungen
  (empfaenger_id, empfaenger_rolle, kategorie, titel, inhalt, kontext_typ, kontext_id, prioritaet, gelesen, created_at)
select
  s.profile_id,
  'sachverstaendiger',
  'update',
  gm.titel,
  gm.nachricht,
  case when gm.fall_id is not null then 'fall' else null end,
  gm.fall_id,
  case when gm.typ in ('vorschaden_warnung','paket_fast_voll','guthaben_niedrig','nachbesichtigung_beauftragt','stellungnahme_beauftragt')
       then 'hoch' else 'normal' end,
  coalesce(gm.gelesen, false),
  gm.created_at
from public.gutachter_mitteilungen gm
join public.sachverstaendige s on s.id = gm.sv_id
where s.profile_id is not null
  and gm.typ not in ('kunde_chat_nachricht','gutachten_erinnerung','qc_nachbesserung','re_termin_kundenwahl');

drop table if exists public.gutachter_mitteilungen;
