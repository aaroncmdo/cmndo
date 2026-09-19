-- Aaron 2026-09-19: Die Verifizierung gatet die Finder-Sichtbarkeit nicht mehr.
--
--   "Die Verifizierung ist ja keine notwendige Sache fuer den Finder … wenn die Admins
--    etwas freigeben moechten, ohne Berufshaftpflicht etc., das ist nicht zwingend
--    notwendig … dann sollen die Sachverstaendigen auch auf der Karte angezeigt werden."
--
-- Gemessen am selben Tag auf prod: von 27 freigeschalteten Gutachtern waren nur 13 im
-- Finder sichtbar. Die uebrigen 14 hatten bezahlt oder waren bewusst vom Admin freigegeben
-- und scheiterten allein an `verifiziert` — einem Flag, das seit dem Tier-2-Fix (08.08.)
-- an zwei hochgeladenen Dokumenten haengt (Berufshaftpflicht + Gewerbeanmeldung).
--
-- WAS DIESE MIGRATION NICHT TUT: `verifiziert` bleibt das nutzersichtbare Vertrauens-Siegel
-- (Fallakte TeamZone, Whitelabel-Gate). Nur die SICHTBARKEIT wird entkoppelt, nicht das
-- VERTRAUEN. Wer keine Dokumente hochlaedt, steht auf der Karte, traegt aber kein Siegel.
--
-- SCHUTZ DES POOLS, unveraendert: portal_zugang_freigeschaltet (bezahlt ODER vom Admin
-- freigegeben — niemand setzt es selbst), ist_aktiv, gesperrt_seit (Admin-Riegel),
-- geloescht_am, ist_testaccount. Standort + Isochrone bleiben, weil ohne sie keine
-- Kartendarstellung moeglich ist.
--
-- ⚠ INVARIANTE: Diese Policy und applyDispatchableFilter (src/lib/sv/queries.ts) muessen
-- dieselbe Menge beschreiben — "auf der Karte gelistet" == "durch die Engine buchbar".
-- Beide wurden im selben PR geaendert. Wer eine anfasst, fasst die andere mit an.
drop policy if exists "sachverstaendige__b1sel_an" on public.sachverstaendige;

create policy "sachverstaendige__b1sel_an"
  on public.sachverstaendige
  for select
  to anon
  using (
    ist_aktiv = true
    and portal_zugang_freigeschaltet = true
    and ist_testaccount = false
    and geloescht_am is null
    and gesperrt_seit is null
    and standort_lat is not null
    and standort_lng is not null
    and isochrone_polygon is not null
  );
