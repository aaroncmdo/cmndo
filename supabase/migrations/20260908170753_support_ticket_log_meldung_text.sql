-- Support-Meldungen gingen seit Mai 2026 verloren: das Widget legt Linear-Tickets an,
-- LINEAR_API_KEY fehlt, und support_ticket_log speicherte nur Metadaten (keinen Text).
-- Der Melder bekam eine Bestaetigung, die nicht stimmte.
--
-- Diese Spalte entkoppelt AUFBEWAHREN von BENACHRICHTIGEN: der Text liegt ab jetzt in der
-- eigenen Datenbank, unabhaengig davon, ob ein externer Ticket-Dienst erreichbar ist.
--
-- Bewusst NULLABLE ohne Default: bestehende 24 Zeilen und der noch nicht deployte Code
-- laufen unveraendert weiter (die Migration wirkt sofort, der Code erst nach dem Deploy).
-- Kein Grant noetig: geschrieben wird per service_role (createAdminClient); gelesen ueber die
-- bestehende Policy support_ticket_log_select_public_consol, die spaltenunabhaengig ist
-- (admin/kundenbetreuer sehen alles, sonst nur die eigenen Zeilen).

alter table public.support_ticket_log
  add column if not exists meldung_text text;

comment on column public.support_ticket_log.meldung_text is
  'Wortlaut der Nutzermeldung aus dem Support-Widget. Ab 08.09.2026 der massgebliche Aufbewahrungsort — der Linear-Pfad ist optional und darf ausfallen, ohne dass die Meldung verloren geht.';
