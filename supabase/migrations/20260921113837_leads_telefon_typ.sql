-- MCP-Eingang haerten (Soll-Blatt 2026-09-21-mcp-eingang-haerten.md, 6b):
-- Der Leitungstyp der Kundennummer, ermittelt per Twilio Lookup v2 (line_type_intelligence)
-- beim Eingang. Zweck ist NICHT Phantom-Erkennung -- gemessen 21.09.: Twilio haelt auch nicht
-- vergebene deutsche Mobilnummern fuer 'reachable'. Zweck ist die KANAL-WEICHE: bei 'landline'
-- sind WhatsApp und SMS aussichtslos, die E-Mail ist dann die einzige Ruecklaufebene, und der
-- KI-Assistent bekommt das in der Tool-Antwort gesagt, bevor ein Lead ohne Kanal entsteht.
--
-- CHECK bewusst mitgeliefert: tasks.typ hatte keinen, und ein sprechender Eigenname machte dort
-- 6 Aufgaben unsichtbar (#6020). Ein Feld ohne CHECK ist ein Vokabular ohne Vertrag.
alter table public.leads
  add column if not exists telefon_typ text,
  add column if not exists telefon_geprueft_am timestamptz;

alter table public.leads
  drop constraint if exists leads_telefon_typ_check;

alter table public.leads
  add constraint leads_telefon_typ_check
  check (telefon_typ is null or telefon_typ = any (array['mobile'::text, 'landline'::text, 'voip'::text, 'unbekannt'::text]));

comment on column public.leads.telefon_typ is
  'Leitungstyp laut Twilio Lookup beim Eingang: mobile | landline | voip | unbekannt (Lookup-Ausfall). NULL = nie geprueft.';
comment on column public.leads.telefon_geprueft_am is
  'Zeitpunkt der Lookup-Abfrage. NULL = nie geprueft.';
