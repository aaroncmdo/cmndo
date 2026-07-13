-- Vertrieb-CRM-Konsolidierung P2: Ansprechpartner-Kontaktfelder auf partner_leads.
-- ansprechpartner_vorname/_nachname existierten bereits; hier Position + direkter Kontakt.
alter table public.partner_leads
  add column if not exists ansprechpartner_position text,
  add column if not exists ansprechpartner_email text,
  add column if not exists ansprechpartner_telefon text;
