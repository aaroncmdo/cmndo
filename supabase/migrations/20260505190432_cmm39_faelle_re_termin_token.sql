-- CMM-39: Re-Termin-Token auf faelle.
--
-- Wenn der SV einen Termin als no-show meldet (no_show_gemeldet_am), bekommt
-- der Kunde einen FlowLink an /kunde/re-termin/{token}, ueber den er einen
-- neuen Slot waehlen kann. Der Storno-Cron (no-show-timeout, 5 Werktage)
-- prueft dann zusaetzlich, ob der Kunde reagiert hat (re_termin_token_
-- eingelaufen_am gesetzt) — wenn ja, kein Storno.
--
-- Pattern angelehnt an kunde_response_token (AAR-702): einmal-verwendbarer
-- UUID-Token + Timestamp wann der Kunde reagiert hat. Token bleibt nach
-- Reaktion bestehen (zur Audit-Sicht), wird aber per eingelaufen_am
-- entwertet — Doppel-Wahl ist damit ausgeschlossen.

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS re_termin_token UUID,
  ADD COLUMN IF NOT EXISTS re_termin_token_eingelaufen_am TIMESTAMPTZ;

-- Lookup-Index: /kunde/re-termin/[token] schlaegt den Fall ueber den Token
-- nach. Partial-Index: nur Eintraege mit aktivem Token interessant.
CREATE INDEX IF NOT EXISTS idx_faelle_re_termin_token
  ON public.faelle (re_termin_token)
  WHERE re_termin_token IS NOT NULL;

COMMENT ON COLUMN public.faelle.re_termin_token IS
  'CMM-39: Einmal-Token fuer /kunde/re-termin/[token]. Wird gesetzt wenn SV no-show meldet (meldeNoShow), entwertet via re_termin_token_eingelaufen_am sobald Kunde reagiert.';

COMMENT ON COLUMN public.faelle.re_termin_token_eingelaufen_am IS
  'CMM-39: Zeitpunkt der Kunden-Reaktion auf den Re-Termin-Link. NULL = noch nicht reagiert. Storno-Cron skipt Faelle wo dieser Wert gesetzt ist.';
