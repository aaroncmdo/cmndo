-- AAR-864: Initiator-Marker für Kunden-getriebene Verlegung.
-- Bisher konnte nur der SV verlegen. Aaron-Spec: Kunde kann auch
-- proaktiv verlegen — dann muss der SV bestätigen statt der Kunde.
-- Plus: solange Kunden-Verlegung pending ist, darf der SV nicht
-- selbst nochmal verlegen (Lock).
--
-- TRUE  = Kunde hat die Verlegung initiiert → SV muss bestätigen
-- FALSE = SV hat initiiert (Default) → Kunde muss bestätigen

ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS verlegung_initiator_kunde BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.gutachter_termine.verlegung_initiator_kunde IS
  'AAR-864: TRUE wenn die Verlegung vom Kunden initiiert wurde — SV muss bestätigen. FALSE = SV-Initiator (Default), Kunde bestätigt.';
