-- Netzwerk-Followup (P0-MINOR, deferred aus P0/P1): INSERT-Rollen-Gate — der Freund-Graph
-- ist ein PROFI-Netz (NetzwerkRolle-Union: sachverstaendiger/werkstatt/flottenmanager/makler).
-- Bisher konnte JEDER authenticated User (auch rolle='kunde') Anfragen INSERTen; die
-- Verbindungs-Actions schreiben ueber den USER-Client -> die Policy ist der scharfe Guard.
-- Rollen-Werte live verifiziert (profiles.rolle 03.08.). Kein bestehender Anfrager verletzt
-- das Gate (einziger Bestand: flottenmanager).
drop policy netzwerk_verbindungen_insert on public.netzwerk_verbindungen;
create policy netzwerk_verbindungen_insert on public.netzwerk_verbindungen
  for insert to authenticated
  with check (
    anfrager_id = auth.uid()
    and anfrager_id <> empfaenger_id
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.rolle in ('sachverstaendiger','werkstatt','flottenmanager','makler')
    )
  );