-- Storno-Gutschrift: Korrekturbeleg bei Reversal einer ausgezahlten Provision.
-- typ='storno'-Rows spiegeln das Original mit negativen Beträgen (Bezug via bezug_gutschrift_id).
-- Das UNIQUE(ledger_tabelle, ledger_id) wird partiell (nur typ='gutschrift') -> ein Original je Payout,
-- aber ein Storno-Row (gleicher Ledger) ist erlaubt. Additiv; Bestand (typ default 'gutschrift') unberührt.

ALTER TABLE public.partner_gutschriften
  ADD COLUMN IF NOT EXISTS typ text NOT NULL DEFAULT 'gutschrift',
  ADD COLUMN IF NOT EXISTS bezug_gutschrift_id uuid REFERENCES public.partner_gutschriften(id),
  ADD COLUMN IF NOT EXISTS storno_grund text;

ALTER TABLE public.partner_gutschriften DROP CONSTRAINT IF EXISTS partner_gutschriften_ledger_tabelle_ledger_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS partner_gutschriften_ledger_original_uniq
  ON public.partner_gutschriften (ledger_tabelle, ledger_id) WHERE typ = 'gutschrift';
