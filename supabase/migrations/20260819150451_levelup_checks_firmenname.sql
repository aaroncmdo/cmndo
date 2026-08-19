alter table public.levelup_checks
  add column firmenname text;

comment on column public.levelup_checks.firmenname is
  'Firmenname, wie der Sachverstaendige ihn angibt. Optional — der Check laeuft auch ohne. Wird an ZWEI Stellen gebraucht: das Modul `wett` findet ohne ihn den eigenen Eintrag in der Kartensuche nicht (und weist den Rang dann als Fehlstelle aus statt einen falschen zu behaupten), und F-06 leitet daraus den Namen des Leads ab (sonst nur aus der Domain).';
