-- F8 (AAR-audit-2fa): auth_remember_tokens hatte GRANT ALL an anon (Baseline).
-- Durch RLS zwar gegatet (nicht ausnutzbar), aber unnoetige Flaeche. anon hat
-- keinen legitimen Zugriff auf Trusted-Device-Tokens -> ganz entziehen.
REVOKE ALL ON public.auth_remember_tokens FROM anon;
