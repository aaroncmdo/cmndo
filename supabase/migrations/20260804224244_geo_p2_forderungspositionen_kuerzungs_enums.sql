-- GEO-P2 SP1: per-Position-Kürzungserfassung in forderungspositionen
-- Erweitert die CHECK-Constraints um die 4 fehlenden Report-Kürzungspositionen
-- (reparatur-Subkomponenten) + eine quelle-Provenienz 'vs_kuerzung'.
-- Tabelle ist leer (0 Zeilen) → additive CHECK-Erweiterung, kein Datenrisiko.

ALTER TABLE public.forderungspositionen DROP CONSTRAINT forderungspositionen_typ_check;
ALTER TABLE public.forderungspositionen ADD CONSTRAINT forderungspositionen_typ_check
  CHECK (typ = ANY (ARRAY[
    'reparatur','wertminderung','nutzungsausfall','mietwagen','gutachterkosten',
    'abschleppkosten','anwaltskosten','kostenpauschale','schmerzensgeld','wbw','restwert','sonstiges',
    'stundenverrechnung','upe','verbringung','beilackierung'
  ]::text[]));

ALTER TABLE public.forderungspositionen DROP CONSTRAINT forderungspositionen_quelle_check;
ALTER TABLE public.forderungspositionen ADD CONSTRAINT forderungspositionen_quelle_check
  CHECK (quelle = ANY (ARRAY['anspruchsschreiben','ruegeschreiben','gutachten','manuell','vs_kuerzung']::text[]));
