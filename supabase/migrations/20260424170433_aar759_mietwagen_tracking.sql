-- AAR-759 Phase 1: Mietwagen + Nutzungsausfall-Tracking.
--
-- Erweitert `faelle` um Mietwagen-Felder. Keine neue Tabelle — Mietwagen
-- ist ein fall-bezogenes Attribut, Multi-Mietwagen-Fälle sind in der
-- Praxis selten genug dass Einzelfelder ausreichen.
--
-- Reminder-Cron und Admin-UI kommen in Phase 1 dazu, Eskalations-Logik
-- läuft bereits über AAR-764 Mitteilungs-Resolver.

-- ─── Mietwagen-Felder ─────────────────────────────────────────────────
ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_hat boolean NOT NULL DEFAULT false;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_seit_datum date;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_limit_tage integer
    CHECK (mietwagen_limit_tage IS NULL OR mietwagen_limit_tage > 0);

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_limit_grund text;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_rechnung_vorhanden boolean NOT NULL DEFAULT false;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_rechnung_url text;

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_argumentations_puffer integer NOT NULL DEFAULT 3
    CHECK (mietwagen_argumentations_puffer >= 0);

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS mietwagen_vermieter text;

-- Bestehend: nutzungsausfall_tage + nutzungsausfall_tagessatz existieren schon
-- (aus Gutachten-Block). Nicht neu anlegen, nur kommentieren für Konsistenz.
COMMENT ON COLUMN public.faelle.nutzungsausfall_tage IS
  'AAR-759: Anzahl Tage Nutzungsausfall wenn kein Mietwagen genommen wurde. Ergänzt durch mietwagen_hat=false.';

COMMENT ON COLUMN public.faelle.mietwagen_hat IS
  'AAR-759: Hat der Kunde einen Mietwagen genommen? Default false.';
COMMENT ON COLUMN public.faelle.mietwagen_seit_datum IS
  'AAR-759: Datum Abholung Mietwagen. Basis für Limit-Berechnung.';
COMMENT ON COLUMN public.faelle.mietwagen_limit_tage IS
  'AAR-759: Anzahl Tage die der Kunde den Mietwagen nehmen darf. Default aus Reparaturdauer oder manuell gesetzt. NULL = kein Limit gesetzt.';
COMMENT ON COLUMN public.faelle.mietwagen_limit_grund IS
  'AAR-759: Begründung des Limits (z.B. "Reparaturdauer", "VS-Anforderung", "Ausleihverträge des Vermieters").';
COMMENT ON COLUMN public.faelle.mietwagen_rechnung_vorhanden IS
  'AAR-759: Hat der Kunde die Vermieter-Rechnung hochgeladen?';
COMMENT ON COLUMN public.faelle.mietwagen_rechnung_url IS
  'AAR-759: Storage-URL der hochgeladenen Mietwagen-Rechnung.';
COMMENT ON COLUMN public.faelle.mietwagen_argumentations_puffer IS
  'AAR-759: Toleranz-Tage die Claimondo für Kunden noch gegenüber der VS argumentieren kann. Default 3.';
COMMENT ON COLUMN public.faelle.mietwagen_vermieter IS
  'AAR-759: Name des Mietwagen-Anbieters (aus OCR oder manuell).';

-- Constraint: wenn mietwagen_hat=true, muss seit_datum gesetzt sein
ALTER TABLE public.faelle
  ADD CONSTRAINT mietwagen_hat_hat_seit_datum
  CHECK (mietwagen_hat = false OR mietwagen_seit_datum IS NOT NULL)
  NOT VALID;

-- NOT VALID = keine Prüfung bestehender Rows (alle haben mietwagen_hat=false).
-- Neue Rows müssen konsistent sein.
