alter table public.levelup_termine
  add column einwilligung_am      timestamptz,
  add column einwilligung_ip_hash text,
  add column einwilligung_text    text;

comment on column public.levelup_termine.einwilligung_am is
  'Zeitpunkt der Einwilligung in die Kontaktaufnahme. Ohne diesen Wert haette der Termin nicht entstehen duerfen (CONTRACT F-06 Schritt 1).';

comment on column public.levelup_termine.einwilligung_ip_hash is
  'SHA-256 der IP zum Zeitpunkt der Einwilligung. Nie die Adresse selbst.';

comment on column public.levelup_termine.einwilligung_text is
  'Wortlaut, dem zugestimmt wurde — damit spaeter belegbar ist, WORIN eingewilligt wurde, nicht nur DASS. consent_records traegt keinen Bezug zum Vorgang, deshalb steht der Nachweis hier.';
