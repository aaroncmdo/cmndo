-- Aaron 2026-09-20 (Antworten auf das Soll-Blatt 2026-09-19-sv-onboarding-auto-freischaltung):
--   "2. ja aber das Unterschriftsfeld muss gesetzt werden."  -> signatur_position
--   "3 ja" (16 Basic-Gutachter ohne Partnervertrag einmalig, nicht blockierend zur Unterschrift fuehren)
--   -> partnervertrag_hinweis_am
--
-- Beide Spalten sind additiv und nullable; die Migration wirkt sofort und ist vor dem
-- Code-Deploy ungefaehrlich (der alte Code kennt die Spalten nicht und liest sie nicht).
-- Grants sind auf beiden Tabellen tabellenweit (column_privileges 20/20 bzw. 95/95, gelesen
-- 20.09.) -> die neuen Spalten erben sie.
--
-- Soll-Blatt: memory/abnahmen/2026-09-20-sv-dokumente-unterschriftsfeld-und-partnervertrag.md

-- 1) Position des Kunden-Unterschriftsfeldes auf einem vom Gutachter hochgeladenen Dokument
--    (Sicherungsabtretung / Honorarvereinbarung / Datenschutzerklaerung / Widerrufsbelehrung).
--    Form (PDF-Punkte, Ursprung unten links wie pdf-lib):
--    { page, x, y, width, height, datum_x?, datum_y?, name_x?, name_y?, pdf_breite, pdf_hoehe, seiten, gesetzt_am }
--    NULL = kein Feld gesetzt: neue Uploads bleiben dann auf status='ausstehend' (nicht im
--    Kundenflow); Bestandsdokumente mit status='hochgeladen' bekommen weiter die Anhang-Seite.
alter table public.pflichtdokumente
  add column if not exists signatur_position jsonb;

comment on column public.pflichtdokumente.signatur_position is
  'Kunden-Unterschriftsfeld auf dem SV-Dokument (PDF-Punkte, Ursprung unten links): page,x,y,width,height, optional datum_x/y, name_x/y, plus pdf_breite/pdf_hoehe/seiten/gesetzt_am. NULL = nicht gesetzt. Aaron 2026-09-20.';

-- 2) Einmal-Hinweis fuer Basic-Gutachter ohne unterschriebenen Partnervertrag: beim naechsten
--    Login einmal auf /gutachter/vertrag umleiten, danach nie wieder (nicht blockierend).
alter table public.sachverstaendige
  add column if not exists partnervertrag_hinweis_am timestamptz;

comment on column public.sachverstaendige.partnervertrag_hinweis_am is
  'Zeitpunkt, zu dem ein Basic-Gutachter ohne Partnervertrag einmalig auf die Vertragsseite geleitet wurde (Aaron 2026-09-20, nicht blockierend). NULL = noch nicht gezeigt.';