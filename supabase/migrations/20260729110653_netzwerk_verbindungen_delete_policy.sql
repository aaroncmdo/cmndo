-- P1 T1: "Verbindung entfernen" (unfriend) = DELETE der Kante. P0 grantete nur select/insert/update.
-- Additiv, keine bestehende Policy veraendert. ("blockiert" bleibt als Row bestehen -> paar_uniq verhindert Neu-Anfrage.)
create policy netzwerk_verbindungen_delete on public.netzwerk_verbindungen
  for delete to authenticated
  using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
grant delete on public.netzwerk_verbindungen to authenticated;
