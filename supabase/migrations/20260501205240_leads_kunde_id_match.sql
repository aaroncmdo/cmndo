-- Dispatcher Kunden-Match: leads.kunde_id zeigt auf den bestehenden
-- profiles-Account, dem der Dispatcher diesen Lead zugeordnet hat.
-- Wird beim Lead→Fall-Convert ausgelesen (siehe convert-lead-to-claim.ts)
-- und schreibt damit faelle.kunde_id direkt — kein neuer Account beim
-- Onboarding noetig wenn der Kunde schon einen hat.
--
-- NULL = neuer Kunde (Default), Onboarding legt einen Account an.
-- Gesetzt = Dispatcher hat im Match-Modal einen bestehenden gewaehlt.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS kunde_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.kunde_id IS
  'Optional: bestehender profiles.id des Kunden. NULL = neuer Kunde, '
  'wird beim Onboarding angelegt. Vom Dispatcher gesetzt via Match-Modal.';

CREATE INDEX IF NOT EXISTS idx_leads_kunde_id
  ON public.leads (kunde_id)
  WHERE kunde_id IS NOT NULL;
