-- Money-Model-Audit Follow-up (Session 6f60c510): REVOKE anon auf interne Money-Tabellen.
-- Defense-in-Depth + Angleichung an die REVOKE-anon-Konvention (partner_gutschriften/claim_payments
-- haben keinen anon-Grant). Verhaltensneutral: RLS gatet anon bereits (authenticated-only Policies)
-- -> anon sieht diese Tabellen weder vorher noch nachher; der anon-SELECT-Grant war redundant.
REVOKE ALL ON public.gutschriften FROM anon;
REVOKE ALL ON public.zahlungseingaenge FROM anon;
REVOKE ALL ON public.zahlungspositionen FROM anon;
