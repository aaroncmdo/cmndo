-- Backfill: Komplettservice = LexDrive immer (Aaron, #3287). Bestands-komplett-Claims,
-- die noch 'nicht_gefragt' sind -> 'partnerkanzlei' (LexDrive). eigene_kanzlei/keine_kanzlei
-- werden bewusst NICHT angefasst (Claim-Ebene-Opt-in des Kunden) -- aktuell ohnehin 0.
UPDATE public.claims
SET kanzlei_wunsch = 'partnerkanzlei'
WHERE service_typ = 'komplett' AND kanzlei_wunsch = 'nicht_gefragt';
