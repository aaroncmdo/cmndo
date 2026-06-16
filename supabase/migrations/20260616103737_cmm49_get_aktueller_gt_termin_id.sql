-- CMM-49 / AAR-552: kanonischer "aktueller Termin"-Selektor.
-- Repliziert EXAKT die t-LATERAL-Selektion aus v_faelle_mit_aktuellem_termin
-- (Status-Prioritaet, dann start_zeit DESC NULLS LAST, LIMIT 1). Writer
-- (stammdaten/lexdrive) nutzen diese Fn, damit sie DENSELBEN Termin treffen, den
-- die View/Reader lesen (sonst Writer/Reader-Termin-Mismatch bei >1 Termin/Claim).
create or replace function public.get_aktueller_gt_termin_id(p_claim_id uuid)
returns uuid
language sql
stable
as $func$
  select gt.id
  from public.gutachter_termine gt
  where gt.claim_id = p_claim_id
    and gt.status = any (array['bestaetigt','verlegung_pending','reserviert','durchgefuehrt','gegenvorschlag'])
  order by (case gt.status
      when 'bestaetigt' then 1
      when 'verlegung_pending' then 2
      when 'gegenvorschlag' then 3
      when 'reserviert' then 4
      when 'durchgefuehrt' then 5
      else 6 end), gt.start_zeit desc nulls last
  limit 1
$func$;

comment on function public.get_aktueller_gt_termin_id(uuid) is
  'CMM-49/AAR-552: kanonischer aktueller-Termin-Selektor; spiegelt das t-LATERAL von v_faelle_mit_aktuellem_termin (Status-Prio + start_zeit DESC NULLS LAST). Writer nutzen ihn, um den Reader-Termin zu treffen.';
