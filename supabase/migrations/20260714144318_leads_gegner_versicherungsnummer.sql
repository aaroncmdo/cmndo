-- Slice 2c Follow-up (Aaron 14.07.): die Haftpflicht-Policennummer des Unfallgegners.
--
-- Warum noetig: die VS-Unfallmeldung (UnfallmeldungVs.tsx) rendert die Vers.-Nr. bereits
-- bedingt im Betreff UND im Body, aber claim_parties.versicherungsnummer war strukturell
-- immer NULL — convert-lead-to-claim.ts:677 sagt es woertlich ("Lead hat keine Quelle").
-- leads hatte nur gegner_schadennummer (= Aktenzeichen, anderes Konzept). Diese Spalte
-- schliesst die Luecke: Wizard -> leads.gegner_versicherungsnummer -> beim Convert in
-- claim_parties.versicherungsnummer (verursacher-Party, SSoT) -> Mail.
--
-- Additiv + nullable: kein Backfill, kein Reader bricht, bestehende Leads bleiben gueltig.
alter table public.leads
  add column if not exists gegner_versicherungsnummer text;

comment on column public.leads.gegner_versicherungsnummer is
  'Policennummer der Haftpflichtversicherung des Unfallgegners (optional, vom Gegner selbst im NFC-Schadenkarte-Flow erfasst). NICHT gegner_schadennummer — das ist das Aktenzeichen/die Schadennummer beim Versicherer. Wandert beim Convert in claim_parties.versicherungsnummer (verursacher) und erscheint in der Unfallmeldung an die Gegner-Haftpflicht.';
