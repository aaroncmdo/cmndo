-- Task 4+5 (Spec/Plan 2026-06-27): sekundaere RLS-Edits.
-- 4) fall_dokumente: SV + Kanzlei SELECT respektieren sichtbar_fuer (wie kunde-Policy).
--    SV-ALL aufgesplittet: SELECT (sichtbar_fuer-gated) + INSERT/UPDATE/DELETE (write, eigene Faelle).
-- 5) gutachter_termine: KB sieht eigene kb_beratung-Termine (claim_id NULL -> kein anderer Pfad).

-- 4a) Kanzlei: sichtbar_fuer-Filter ergaenzen
drop policy if exists "Kanzlei liest fall_dokumente" on public.fall_dokumente;
create policy "Kanzlei liest fall_dokumente" on public.fall_dokumente for select to public
using (
  exists (select 1 from faelle_claim_bridge b join claims c on c.id=b.claim_id
          join profiles on profiles.id=(select auth.uid())
          where b.fall_id=fall_dokumente.fall_id and profiles.rolle='kanzlei' and c.service_typ='komplett')
  and sichtbar_fuer @> array['kanzlei']
);

-- 4b) SV: ALL -> SELECT (sichtbar_fuer) + write-Policies (ungated, eigene Faelle)
drop policy if exists "SV eigene Fall-Dokumente" on public.fall_dokumente;
create policy "SV liest sichtbare Fall-Dokumente" on public.fall_dokumente for select to public
using (
  fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
              where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid())))
  and sichtbar_fuer @> array['sachverstaendiger']
);
create policy "SV schreibt eigene Fall-Dokumente ins" on public.fall_dokumente for insert to public
with check (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                        where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));
create policy "SV aendert eigene Fall-Dokumente upd" on public.fall_dokumente for update to public
using (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                   where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));
create policy "SV loescht eigene Fall-Dokumente del" on public.fall_dokumente for delete to public
using (fall_id in (select b.fall_id from faelle_claim_bridge b join claims c on c.id=b.claim_id
                   where c.sv_id in (select id from sachverstaendige where profile_id=(select auth.uid()))));

-- 5) KB: eigene kb_beratung-Termine
drop policy if exists "KB liest eigene kb_beratung Termine" on public.gutachter_termine;
create policy "KB liest eigene kb_beratung Termine" on public.gutachter_termine for select to authenticated
using (
  typ = 'kb_beratung'
  and ((kb_id = (select auth.uid()))
       or (assignee_typ = 'kundenbetreuer' and assignee_id = (select auth.uid())))
);
