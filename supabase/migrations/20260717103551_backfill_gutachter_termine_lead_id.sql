-- P3.3 (Operativ-Audit 17.07.): Backfill lead_id fuer bezug-native Termine.
-- Befund: 5 gutachter_termine haben bezug_typ='lead' + bezug_id, aber lead_id/claim_id/fall_id
-- alle NULL ("nur polymorph") -> naive .eq('lead_id')-Queries uebersehen sie (unterzaehlen um
-- bis zu 1/3). Prod-geprobt: 0 lead-Waisen, 0 lead_id-Mismatch -> lead_id = bezug_id ist sicher.
-- Idempotent (WHERE lead_id IS NULL). Trigger-sicher: validate_claim_id greift nur bei
-- fall_id NOT NULL (hier NULL); assignee-Trigger unberuehrt.
--
-- BESTANDSFIX, NICHT nachhaltig: bezug_typ/bezug_id ist die KANONISCHE Achse (die Termin-
-- Engine schreibt neue Termine bezug-nativ OHNE lead_id, siehe effektive-bezug-ids.ts +
-- engine/CONTRACT.md). Neue bezug-native Termine driften also erneut. Der nachhaltige Fix ist
-- die Migration der naiven lead_id-Consumer auf den vorhandenen Helper effektiveBezugIds()
-- (Dual-Lookup Legacy-Vorrang + bezug-Fallback) -- dokumentierter Folge-Slice, nicht dieser.
UPDATE public.gutachter_termine
SET lead_id = bezug_id
WHERE bezug_typ = 'lead' AND lead_id IS NULL AND bezug_id IS NOT NULL;
