-- auftraege-Exposure Schicht 2/2 (Tabellen-Pfad): den Kunden/Party-Zweig aus der SELECT-Policy nehmen.
--
-- Befund: auftraege__b1sel liess neben Staff + zugewiesenem SV auch JEDE claim_party
-- (is_claim_user_party -> claim_parties.user_id = auth.uid(), inkl. Geschaedigter/Kunde) die
-- ganze auftraege-Zeile lesen -> Kunde konnte grundhonorar (SV-Honorar) + sv_notizen_vor_ort /
-- filmcheck_notizen / technische_stellungnahme_notiz_sv seines eigenen Falls per PostgREST lesen
-- (GET /auftraege?select=grundhonorar_netto). SV-interne Daten.
--
-- Fix: den is_claim_user_party-Zweig entfernen -> nur noch Staff + zugewiesener SV.
-- Sicher: KEIN User-Client-Pfad einer claim_party liest auftraege — der einzige Kunde-Read
-- (kunde/re-termin/[token], nur .select('storniert_am')) laeuft ueber createAdminClient()
-- (Token-Flow, bypasst RLS). Staff- + SV-Zweige unveraendert.
-- InitPlan-gewrappt (SELECT auth.uid()) fuer den RLS-Perf-Ratchet.

alter policy auftraege__b1sel on public.auftraege
using (
  (EXISTS ( SELECT 1 FROM profiles p
            WHERE p.id = ( SELECT auth.uid() )
              AND p.rolle = ANY (ARRAY['admin','dispatch','kundenbetreuer','kanzlei']::user_role[]) ))
  OR
  (EXISTS ( SELECT 1 FROM sachverstaendige sv
            WHERE sv.id = auftraege.sv_id
              AND sv.profile_id = ( SELECT auth.uid() ) ))
);

-- fail-closed: is_claim_user_party raus, SV- + Staff-Zweig noch da.
do $$
declare v_qual text;
begin
  select qual into v_qual from pg_policies
  where schemaname='public' and tablename='auftraege' and policyname='auftraege__b1sel';
  if v_qual ~* 'is_claim_user_party' then
    raise exception 'FAIL-CLOSED: is_claim_user_party ist noch in der auftraege-Policy.';
  end if;
  if v_qual !~* 'sachverstaendige' then
    raise exception 'FAIL-CLOSED: SV-Zweig fehlt jetzt — zu viel entfernt!';
  end if;
  if v_qual !~* 'kundenbetreuer' then
    raise exception 'FAIL-CLOSED: Staff-Zweig fehlt jetzt — zu viel entfernt!';
  end if;
  raise notice 'OK: Kunde/Party-Zweig aus auftraege-SELECT-Policy entfernt (Staff + SV bleiben).';
end $$;
