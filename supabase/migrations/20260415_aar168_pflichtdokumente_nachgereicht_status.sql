-- AAR-168 Fix: CHECK-Constraint auf pflichtdokumente.status erweitern.
-- markDokumentNachgereicht() setzt status='nachgereicht_angefordert', der
-- alte Constraint erlaubte aber nur ['ausstehend', 'hochgeladen', 'geprueft',
-- 'abgelehnt']. Ohne diese Migration crasht der Nachreichen-Flow komplett.

ALTER TABLE pflichtdokumente DROP CONSTRAINT IF EXISTS pflichtdokumente_status_check;
ALTER TABLE pflichtdokumente ADD CONSTRAINT pflichtdokumente_status_check
  CHECK (status = ANY (ARRAY[
    'ausstehend'::text,
    'hochgeladen'::text,
    'geprueft'::text,
    'abgelehnt'::text,
    'nachgereicht_angefordert'::text
  ]));
