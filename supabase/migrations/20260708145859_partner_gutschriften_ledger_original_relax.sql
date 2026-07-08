-- Gutschrift-Korrektur: partiellen Unique-Index relaxen, damit eine korrigierte Neu-Original
-- neben der stornierten Alt-Original koexistieren kann (recompute-reissue-Muster). Es bleibt
-- max. 1 AKTIVE Original je Ledger (Idempotenz-Schutz erhalten); stornierte zaehlen nicht mehr.
DROP INDEX IF EXISTS public.partner_gutschriften_ledger_original_uniq;
CREATE UNIQUE INDEX partner_gutschriften_ledger_original_uniq
  ON public.partner_gutschriften (ledger_tabelle, ledger_id)
  WHERE typ = 'gutschrift' AND status <> 'storniert';
