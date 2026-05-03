-- leads.rueckruf_geplant_am: Geplanter Rückruf-Termin (Datum + Uhrzeit).
--
-- Hintergrund: AAR-637 hat rueckruf_datum/rueckruf_termin von leads gedroppt
-- und als Single-Source-of-Truth auf admin_termine (typ='rueckruf') verschoben.
-- Das bedeutet: auf der leads-Zeile selbst sieht man nur created_at (Eingangs-
-- Zeitstempel), aber nicht WANN der Rückruf stattfinden soll. Jede Ansicht
-- (Dispatch-Liste, Supabase Studio, API) muss admin_termine joinen um die Zeit
-- zu bekommen — unpraktisch und fehleranfällig.
--
-- Lösung: denormalisierte Spalte rueckruf_geplant_am auf leads.
-- Wird von saveRueckruf() synchron geschrieben wenn ein Rückruf eingetragen
-- oder verschoben wird, und auf NULL gesetzt wenn er erledigt/abgesagt wird.
-- admin_termine bleibt Single-Source-of-Truth für den vollständigen Termin
-- (Kalender, Google-Sync, Status-History) — rueckruf_geplant_am ist nur ein
-- Schnell-Lookup-Feld für Listenansichten und Dispatch-Filter.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS rueckruf_geplant_am timestamptz;

COMMENT ON COLUMN public.leads.rueckruf_geplant_am IS
  'Geplanter Rückruf-Termin (Datum + Uhrzeit). Denormalisiert aus '
  'admin_termine.start_zeit (typ=rueckruf). Wird von saveRueckruf() '
  'synchron gesetzt und auf NULL gesetzt wenn erledigt/abgesagt.';

-- Bestehende offene Rückrufe rückwirkend befüllen
UPDATE public.leads l
SET rueckruf_geplant_am = at.start_zeit
FROM public.admin_termine at
WHERE at.lead_id = l.id
  AND at.typ = 'rueckruf'
  AND at.status = 'offen';

CREATE INDEX IF NOT EXISTS idx_leads_rueckruf_geplant_am
  ON public.leads (rueckruf_geplant_am)
  WHERE rueckruf_geplant_am IS NOT NULL;
