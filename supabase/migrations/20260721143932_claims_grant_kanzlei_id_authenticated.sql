-- Blocker-Fix: kanzlei-tenant-scoping-Migration 20260719225150 fuegte claims.kanzlei_id
-- ohne SELECT-Grant fuer authenticated hinzu -> check:claims-column-grants rot (R71-Klasse),
-- blockt alle migration-tragenden Release-Runden. Owner-Lane 618dfb69 inaktiv.
-- kanzlei_id = nicht-sensibler Tenant-FK; RLS schraenkt Zeilen bereits ein (Column-Grant umgeht keine RLS).
GRANT SELECT (kanzlei_id) ON public.claims TO authenticated;
