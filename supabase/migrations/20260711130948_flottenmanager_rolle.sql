-- flottenmanager-Rolle fuers Business-Partner-Flotten-Portal (firmen mit Flotte).
-- Eigene Migration: ALTER TYPE ADD VALUE isoliert von jeder Nutzung des Werts.
-- Getrackte Version 20260711130948 (via plugin apply_migration).
alter type public.user_role add value if not exists 'flottenmanager';
