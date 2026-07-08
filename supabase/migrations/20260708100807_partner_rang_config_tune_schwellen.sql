-- Live-Tuning (Aaron 2026-07-08): Cold-Start-Daten zeigten alle Partner Bronze
-- (Schwellen ueber der Credential-Decke ~30). Silber 35->25, Gold 60->45, damit
-- top-bewertete SVs (Score ~30) sofort Silber differenzieren. DB-getriebener Payoff
-- (kein Code-Deploy). prod-applied 20260708100807.
update public.partner_rang_config set wert = 25, updated_at = now() where schluessel = 'schwelle_silber';
update public.partner_rang_config set wert = 45, updated_at = now() where schluessel = 'schwelle_gold';
