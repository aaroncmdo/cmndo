-- CMM-32: Backfill 32b war zu lax — er legte für jeden Fall mit
-- nachbesichtigung_status IS NOT NULL einen 2. Auftrag an. Tatsächlich ist
-- der Default 'nicht-angefordert', das ist KEINE aktive Nachbesichtigung.
-- Diese Auftraege werden gelöscht; künftig werden nachbesichtigung-Auftraege
-- nur noch via expliziten requestNachbesichtigung-Pfad angelegt.

DELETE FROM public.auftraege a
USING public.faelle f
WHERE a.fall_id = f.id
  AND a.typ = 'nachbesichtigung'
  AND (
    f.nachbesichtigung_status IS NULL
    OR f.nachbesichtigung_status::text NOT IN
       ('angefordert','termin-eingereicht','durchgefuehrt','abgeschlossen')
  );
