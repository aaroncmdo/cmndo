-- AAR-642: termine-Tabelle dokumentieren (nicht deprecaten).
--
-- Ausgangslage: Drei Termin-Tabellen nebeneinander, Scope war unklar dokumentiert.
--   - admin_termine   → Rückrufe + interne Termine + Kunden-Termine ohne Google-Sync
--                       (AAR-637 SoT für Rückrufe — typ ∈ rueckruf, kunde, intern)
--   - gutachter_termine → SV-Besichtigungstermine + KB-Beratung als Video/Tel
--                       (AAR-640 Shared-Tabelle — typ ∈ vor_ort, video, tel, kb_beratung)
--   - termine         → KB↔Kunde-Videocalls/Telefonate mit Google-Calendar-Sync
--                       (eigener Use-Case — braucht google_event_id/calendar_id/meet_link)
--
-- Das Ticket fragte "deprecaten oder dokumentieren?". Ergebnis: Dokumentieren —
-- `termine` hat aktive Reader (5) + Writer (2) + Google-Sync-Spalten die
-- weder admin_termine noch gutachter_termine haben. Die drei Tabellen decken
-- unterschiedliche Domains ab und sind nicht redundant.
--
-- Aktive Nutzung (Stand 2026-04-21):
--   Writer:
--     - src/app/faelle/[id]/actions.ts (createKundeTermin, updateTerminStatus)
--     - src/app/admin/DashboardClient.tsx (Quick-Add im Heute-Widget)
--   Reader:
--     - src/app/admin/DashboardClient.tsx (Heute-Timeline Kunden-Termine)
--     - src/app/admin/kalender/page.tsx (Admin-Kalender Monatsview)
--     - src/app/admin/_components/TageskalenderWidget.tsx (Tageskalender)
--     - src/app/mitarbeiter/performance/page.tsx (MA-Performance + Heute-Termine)
--     - src/app/faelle/[id]/actions.ts (updateTerminStatus Read-back)
--
-- Dieser Patch fügt nur Doku hinzu (COMMENT) — keine Schema-Änderung, keine Daten.

COMMENT ON TABLE public.termine IS
  'AAR-642: KB↔Kunde-Beratungstermine mit Google-Calendar-Sync.

   Scope: Videocalls und Telefonate zwischen Kundenbetreuer (betreuer_user_id)
   und Kunde (kunde_user_id) im Kontext eines Falls (fall_id). Einziger
   Termin-Typ der Google-Meet-Links + Calendar-Sync pflegt.

   NICHT für: Rückrufe (→ admin_termine typ=rueckruf, AAR-637),
              SV-Besichtigungen (→ gutachter_termine, AAR-638),
              KB-Beratungen als Video-Termin im SV-Flow (→ gutachter_termine typ=kb_beratung, AAR-640),
              Kanzlei-Termine (→ admin_termine typ=kunde, AAR-641).

   Writer: /faelle/[id]/actions.ts (createKundeTermin), /admin/DashboardClient (Quick-Add).
   Reader: /admin/DashboardClient, /admin/kalender, /admin/TageskalenderWidget,
           /mitarbeiter/performance, /faelle/[id]/actions (Read-back).';

COMMENT ON COLUMN public.termine.typ IS
  'Termin-Kanal. Erwartete Werte: video-call | telefonat.
   Nicht als ENUM modelliert — legacy plain text. Bei Erweiterung bitte
   konsistent in allen Writern ergänzen.';

COMMENT ON COLUMN public.termine.status IS
  'Termin-Lifecycle. Erwartete Werte:
     geplant       → Initial-Zustand nach createKundeTermin
     bestaetigt    → Kunde hat bestätigt (Admin-UI + MA-Performance filtern darauf)
     durchgefuehrt → Termin fand statt (ergebnis_notiz wird dann gesetzt)
     abgesagt      → vom KB oder Kunde abgesagt (wird in Heute-Listen gefiltert)
     verschoben    → mit verschiebung_grund
   Nicht als ENUM modelliert — legacy plain text. State-Transition über
   updateTerminStatus() in /faelle/[id]/actions.ts.';

COMMENT ON COLUMN public.termine.google_event_id IS
  'Google-Calendar-Event-ID — gesetzt wenn Termin via Google-Calendar-API
   erstellt wurde. Zusammen mit google_calendar_id + meet_link und
   event_sync_status (synced | not_synced) die einzige Termin-Tabelle mit
   Google-Sync.';

COMMENT ON COLUMN public.termine.kunde_user_id IS
  'Kunde (auth.users) — Zielgruppe des Termins. Wird beim Insert aus
   faelle.kunde_id befüllt. NULL nur wenn Fall keinen Kunden hat (selten).';

COMMENT ON COLUMN public.termine.betreuer_user_id IS
  'Kundenbetreuer (auth.users) — hält den Termin. MA-Performance-View
   filtert hierauf (betreuer_user_id = user.id).';
