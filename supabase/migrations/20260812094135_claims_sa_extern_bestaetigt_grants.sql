-- Ops-Test 12.08. (#5197): SELECT-Grant fuer die beiden neuen SA-Spalten.
--
-- Die Migration 20260812083037 legte sa_extern_bestaetigt_am/_von an. Seit der
-- Default-Privileges-Wurzel (#4555) bekommt eine NEUE public-Spalte KEINEN Grant
-- automatisch — check:claims-column-grants meldet sie deshalb als NEUE_SPALTE
-- ("weder gegrantet noch als intern deklariert"), und ohne Grant waeren sie fuer
-- User-Clients unsichtbar (stiller PostgREST-Fehler statt Fehlermeldung).
--
-- Entscheidung GRANT statt intern-Cap — das Haus-Muster ist eindeutig (geprueft
-- 12.08. via has_column_privilege): JEDE vergleichbare claims-Spalte ist fuer
-- authenticated lesbar, anon fuer keine:
--   sa_unterschrieben, sa_unterschrieben_am, sa_pdf_url, sa_unterschrift_url  -> true
--   phase_override_von, reparatur_freigegeben_von, vollmacht_geprueft_von     -> true
-- sa_extern_bestaetigt_am ist das GLEICHWERTIGE zweite Signal zu sa_unterschrieben
-- (onboarding-gate.ts: kundeHatBestaetigt). Waere es ungegrantet, koennte eine UI,
-- die "SA liegt vor" anzeigt, nur die halbe Wahrheit lesen. _von ist die Urheber-
-- Angabe, exakt analog zu den vier bestehenden *_von-Spalten.
-- Die interne Cap-Liste (audit_claims_column_grants v_intern) traegt bewusst nur
-- KOMMERZIELLE Daten (Notizen, Margen, Lead-Preise, Kanzlei-Honorare) — dorthin
-- gehoert ein Fall-Status nicht.
--
-- anon bewusst NICHT: kein anon-Consumer, und der Anon-Grant-Ratchet haelt die
-- Flaeche klein.

grant select (sa_extern_bestaetigt_am, sa_extern_bestaetigt_von)
  on public.claims to authenticated;
